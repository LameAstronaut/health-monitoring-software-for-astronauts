use crate::physiology::{Activity, CREW_IDS, ECG_HZ, Physiology};
use crate::{Measurement, Scenario};
use chrono::Utc;
use reqwest::Client;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::HashMap, error::Error};

#[derive(Clone, Debug, Deserialize)]
pub struct Control {
    #[serde(default)]
    pub manual_values: HashMap<String, Option<f64>>,
    pub scenario: Activity,
    pub astronaut_id: String,
    pub running: bool,
    pub speed: f64,
    pub seed: u64,
    pub fault: String,
    pub revision: u64,
    pub run_id: String,
}

#[derive(Debug, Deserialize)]
pub struct ExamCommand {
    pub id: String,
    pub astronaut_id: String,
    pub kind: String,
    pub device_id: String,
}

#[derive(Debug, Deserialize)]
pub struct Runtime {
    pub control: Control,
    pub checkpoints: HashMap<String, Physiology>,
    pub next_sequences: HashMap<String, u64>,
    pub pending_examinations: Vec<ExamCommand>,
}

pub async fn load(client: &Client, base: &str, token: &str) -> Result<Runtime, Box<dyn Error>> {
    Ok(client
        .get(format!("{base}/api/v1/demo/runtime"))
        .header("X-Demo-Token", token)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?)
}

pub fn summaries(model: &Physiology, invalid: bool) -> Vec<Measurement> {
    let quality = if invalid { "INVALID" } else { "VALID" };
    [
        ("heart_rate", model.heart_rate, "beats/min"),
        ("respiratory_rate", model.respiratory_rate, "breaths/min"),
        ("spo2", model.spo2, "%"),
        ("suit_pressure", model.suit_pressure, "kPa"),
    ]
    .into_iter()
    .map(|(code, value, unit)| Measurement {
        code,
        value: (value * 10.0).round() / 10.0,
        unit,
        quality,
    })
    .collect()
}

pub fn continuous_packet(
    model: &Physiology,
    wave: Vec<f64>,
    start: f64,
    sequence: u64,
    run: &str,
    control: &Control,
) -> Value {
    let crew = CREW_IDS[model.crew_index];
    let mut measurements = summaries(
        model,
        control.fault == "SENSOR_ERROR" && control.astronaut_id == crew,
    );
    if control.astronaut_id == crew {
        for measurement in &mut measurements {
            if let Some(Some(value)) = control.manual_values.get(measurement.code) {
                measurement.value = *value;
            }
        }
    }
    json!({
        "schema_version": "1.0", "event_id": format!("demo-{run}-{}-{sequence}", model.crew_index),
        "sequence": sequence, "observed_at": Utc::now(), "astronaut_id": crew,
        "device_id": format!("DEMO-SUIT-00{}", model.crew_index + 1), "source_type": "SIMULATED",
        "scenario_id": model.activity, "run_id": control.run_id, "revision": control.revision,
        "simulated_at": model.elapsed(), "model_state": model,
        "waveform": {"sample_rate_hz": ECG_HZ, "start_simulated_at": start,
                     "unit": "mV", "lead": "DEMO-II", "samples": wave},
        "measurements": measurements
    })
}

pub fn exam_packet(
    command: &ExamCommand,
    model: &Physiology,
    sequence: u64,
    run: &str,
    playback: &str,
) -> Value {
    // Event-only fixtures. They never enter the continuous numerical state or drift over time.
    let offset = model.crew_index as f64;
    let measurements = match command.kind.as_str() {
        "BLOOD_PRESSURE" => vec![
            json!({"code":"systolic_bp", "value":118.0 + offset * 2.0, "unit":"mmHg", "quality":"VALID"}),
            json!({"code":"diastolic_bp", "value":76.0 + offset, "unit":"mmHg", "quality":"VALID"}),
        ],
        "LAB_PANEL" => vec![
            json!({"code":"wbc", "value":5.8 + offset * 0.2, "unit":"10^9/L", "quality":"VALID"}),
            json!({"code":"hemoglobin", "value":14.1 + offset * 0.3, "unit":"g/dL", "quality":"VALID"}),
        ],
        "BONE_DENSITY" => vec![json!({"code":"bone_density", "value":1.10 + offset * 0.02,
                                     "unit":"g/cm2", "quality":"VALID"})],
        _ => Vec::new(),
    };
    json!({"schema_version":"1.0", "event_id":format!("demo-{run}-exam-{}-{sequence}", command.id),
        "sequence":sequence, "observed_at":Utc::now(), "astronaut_id":command.astronaut_id,
        "device_id":command.device_id, "source_type":"SIMULATED", "scenario_id":"EXAMINATION",
        "examination_id":command.id, "simulated_at":model.elapsed(), "measurements":measurements,
        "run_id":playback})
}

pub fn activity_for(scenario: Scenario) -> (Activity, &'static str) {
    match scenario {
        Scenario::OxygenDropDemo => (Activity::Anomaly, "OXYGEN"),
        Scenario::PressureAnomalyDemo => (Activity::Anomaly, "PRESSURE"),
        Scenario::SimultaneousDemo => (Activity::Anomaly, "BOTH"),
        Scenario::Exercise => (Activity::Exercise, "NONE"),
        Scenario::Recovery => (Activity::Recovery, "NONE"),
        Scenario::Anomaly => (Activity::Anomaly, "BOTH"),
        _ => (Activity::Rest, "NONE"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn manual_values_are_targeted_and_keep_sensor_quality() {
        let control: Control = serde_json::from_value(json!({
            "scenario": "REST", "astronaut_id": CREW_IDS[0], "running": true,
            "speed": 1, "seed": 42, "fault": "SENSOR_ERROR", "revision": 1,
            "run_id": "test", "manual_values": {"heart_rate": 88, "spo2": null}
        }))
        .unwrap();
        let model = Physiology::new(42, 0);
        let packet = continuous_packet(&model, vec![0.0], 0.0, 0, "test", &control);
        assert_eq!(packet["measurements"][0]["value"], 88.0);
        assert_eq!(packet["measurements"][0]["quality"], "INVALID");
        assert_eq!(packet["model_state"]["heart_rate"], model.heart_rate);
        let other = Physiology::new(42, 1);
        let packet = continuous_packet(&other, vec![0.0], 0.0, 0, "test", &control);
        assert_ne!(packet["measurements"][0]["value"], 88.0);
        assert_eq!(packet["measurements"][0]["quality"], "VALID");
    }

    #[test]
    fn static_results_only_exist_in_exam_packets() {
        let mut model = Physiology::new(42, 0);
        let command = ExamCommand {
            id: "exam".into(),
            astronaut_id: CREW_IDS[0].into(),
            kind: "LAB_PANEL".into(),
            device_id: "DEMO-LAB-001".into(),
        };
        let first = exam_packet(&command, &model, 1, "test", "test-playback");
        model.advance(125 * 300, Activity::Exercise, "NONE");
        assert_eq!(
            first["measurements"],
            exam_packet(&command, &model, 2, "test", "test-playback")["measurements"]
        );
        assert!(
            summaries(&model, false)
                .iter()
                .all(|m| !matches!(m.code, "wbc" | "bone_density" | "systolic_bp"))
        );
    }
}
