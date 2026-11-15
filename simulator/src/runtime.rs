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
        ("systolic_bp", model.systolic_bp, "mmHg"),
        ("diastolic_bp", model.diastolic_bp, "mmHg"),
        ("sleep_duration", model.sleep_duration, "h"),
        ("weight", model.weight, "kg"),
    ]
    .into_iter()
    .map(|(code, value, unit)| Measurement {
        code,
        value: (value * 10.0).round() / 10.0,
        unit,
        quality: if model.deceased && code == "spo2" {
            "INVALID"
        } else {
            quality
        },
    })
    .collect()
}

/// Apply a terminal fixture to model state before generating ECG or publishing readings.
pub fn advance_controlled(model: &mut Physiology, samples: usize, control: &Control) -> Vec<f64> {
    let selected = control.astronaut_id == CREW_IDS[model.crew_index];
    if selected
        && !model.deceased
        && !matches!(control.fault.as_str(), "SENSOR_ERROR" | "DISCONNECT")
    {
        let trigger = summaries(model, false).into_iter().find(|reading| {
            !matches!(reading.code, "sleep_duration" | "weight")
                && control
                    .manual_values
                    .get(reading.code)
                    .copied()
                    .flatten()
                    .unwrap_or(reading.value)
                    == 0.0
        });
        if let Some(reading) = trigger {
            model.deceased = true;
            model.heart_rate = 0.0;
            match reading.code {
                "respiratory_rate" => model.respiratory_rate = 0.0,
                "systolic_bp" => model.systolic_bp = 0.0,
                "diastolic_bp" => model.diastolic_bp = 0.0,
                "suit_pressure" => model.suit_pressure = 0.0,
                _ => (),
            }
        }
    }
    model.advance(
        samples,
        if selected {
            control.scenario
        } else {
            Activity::Rest
        },
        if selected { &control.fault } else { "NONE" },
    )
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
            if model.deceased
                && !matches!(
                    measurement.code,
                    "suit_pressure" | "sleep_duration" | "weight"
                )
            {
                continue;
            }
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
        "BODY_TEMPERATURE" => vec![
            json!({"code":"body_temperature", "value":(366.0 + offset) / 10.0,
                                          "unit":"°C", "quality":"VALID"}),
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

    fn control() -> Control {
        serde_json::from_value(json!({
            "scenario": "REST", "astronaut_id": CREW_IDS[0], "running": true,
            "speed": 1, "seed": 42, "fault": "NONE", "revision": 1,
            "run_id": "test", "manual_values": {}
        }))
        .unwrap()
    }

    #[test]
    fn terminal_fixtures_update_vitals_and_ecg_without_changing_other_crew() {
        for code in [
            "heart_rate",
            "respiratory_rate",
            "spo2",
            "suit_pressure",
            "systolic_bp",
            "diastolic_bp",
        ] {
            let mut control = control();
            control.manual_values.insert(code.into(), Some(0.0));
            let mut model = Physiology::new(42, 0);
            let wave = advance_controlled(&mut model, 125, &control);
            assert!(model.deceased);
            assert_eq!(model.heart_rate, 0.0);
            assert!(wave.iter().all(|sample| *sample == 0.0));
            let first = continuous_packet(&model, wave, 0.0, 1, "test", &control);
            assert_eq!(first["model_state"]["deceased"], true);
            assert_eq!(first["measurements"][2]["quality"], "INVALID");
            let mut other = Physiology::new(42, 1);
            let other_wave = advance_controlled(&mut other, 125, &control);
            assert!(!other.deceased);
            assert!(other_wave.iter().any(|sample| *sample > 0.5));

            // Clearing a zero or setting a positive override cannot revive a terminal run.
            control.manual_values.clear();
            control
                .manual_values
                .insert("heart_rate".into(), Some(90.0));
            control.manual_values.insert("spo2".into(), Some(99.0));
            control
                .manual_values
                .insert("systolic_bp".into(), Some(120.0));
            let mut resumed: Physiology =
                serde_json::from_value(serde_json::to_value(&model).unwrap()).unwrap();
            let before = model.clone();
            advance_controlled(&mut model, 5, &control);
            assert!(
                model.systolic_bp <= before.systolic_bp
                    && model.diastolic_bp <= before.diastolic_bp
            );
            assert!((model.systolic_bp - before.systolic_bp).abs() <= 60.0 * 0.04);
            let rest = advance_controlled(&mut model, 125 * 30 - 5, &control);
            advance_controlled(&mut resumed, 125 * 30, &control);
            assert_eq!(model, resumed);
            assert_eq!(model.respiratory_rate, 0.0);
            assert_eq!(model.systolic_bp, 0.0);
            assert_eq!(model.diastolic_bp, 0.0);
            assert!((model.suit_pressure - 30.0).abs() < 0.4);
            let packet = continuous_packet(&model, rest, 1.0, 2, "test", &control);
            assert_eq!(packet["measurements"][0]["value"], 0.0);
            assert_eq!(packet["measurements"][4]["value"], 0.0);
            assert_eq!(packet["measurements"][2]["quality"], "INVALID");
        }
    }

    #[test]
    fn faulty_sensors_do_not_trigger_terminal_state_and_legacy_checkpoints_default_to_alive() {
        for fault in ["SENSOR_ERROR", "DISCONNECT"] {
            let mut control = control();
            control.fault = fault.into();
            control.manual_values.insert("heart_rate".into(), Some(0.0));
            let mut model = Physiology::new(42, 0);
            advance_controlled(&mut model, 125, &control);
            assert!(!model.deceased);
        }
        let mut legacy = serde_json::to_value(Physiology::new(42, 0)).unwrap();
        legacy.as_object_mut().unwrap().remove("deceased");
        let model: Physiology = serde_json::from_value(legacy).unwrap();
        assert!(!model.deceased);
    }

    #[test]
    fn completed_sleep_is_stable_editable_and_never_a_terminal_trigger() {
        for crew in 0..3 {
            let mut model = Physiology::new(42, crew);
            let sleep = model.sleep_duration;
            for activity in [
                Activity::Rest,
                Activity::Exercise,
                Activity::Recovery,
                Activity::Anomaly,
            ] {
                model.advance(125 * 60, activity, "MULTI_SYSTEM");
                assert_eq!(model.sleep_duration, sleep);
            }
            let mut legacy = serde_json::to_value(&model).unwrap();
            legacy.as_object_mut().unwrap().remove("sleep_duration");
            assert_eq!(
                serde_json::from_value::<Physiology>(legacy)
                    .unwrap()
                    .sleep_duration,
                7.5
            );
            let resumed: Physiology =
                serde_json::from_value(serde_json::to_value(&model).unwrap()).unwrap();
            assert_eq!(resumed.sleep_duration, sleep);
        }
        let mut model = Physiology::new(42, 0);
        let mut control = control();
        control
            .manual_values
            .insert("sleep_duration".into(), Some(0.0));
        let wave = advance_controlled(&mut model, 125, &control);
        assert!(!model.deceased);
        assert!(wave.iter().any(|sample| *sample > 0.5));
        let packet = continuous_packet(&model, wave, 0.0, 1, "test", &control);
        let sleep = packet["measurements"]
            .as_array()
            .unwrap()
            .iter()
            .find(|item| item["code"] == "sleep_duration")
            .unwrap();
        assert_eq!(sleep["value"], 0.0);
        assert_eq!(sleep["unit"], "h");
        model.deceased = true;
        let wave = advance_controlled(&mut model, 125, &control);
        let packet = continuous_packet(&model, wave, 1.0, 2, "test", &control);
        let sleep = packet["measurements"]
            .as_array()
            .unwrap()
            .iter()
            .find(|item| item["code"] == "sleep_duration")
            .unwrap();
        assert_eq!(sleep["value"], 0.0);
        assert_eq!(model.sleep_duration, 7.5);
    }

    #[test]
    fn recorded_weight_is_stable_editable_and_never_a_terminal_trigger() {
        for crew in 0..3 {
            let mut model = Physiology::new(42, crew);
            let weight = model.weight;
            for activity in [
                Activity::Rest,
                Activity::Exercise,
                Activity::Recovery,
                Activity::Anomaly,
            ] {
                model.advance(125 * 60, activity, "MULTI_SYSTEM");
                assert_eq!(model.weight, weight);
            }
            let mut legacy = serde_json::to_value(&model).unwrap();
            legacy.as_object_mut().unwrap().remove("weight");
            assert_eq!(
                serde_json::from_value::<Physiology>(legacy).unwrap().weight,
                70.0
            );
            let resumed: Physiology =
                serde_json::from_value(serde_json::to_value(&model).unwrap()).unwrap();
            assert_eq!(resumed.weight, weight);
        }
        let mut model = Physiology::new(42, 0);
        let mut control = control();
        control.manual_values.insert("weight".into(), Some(0.0));
        let wave = advance_controlled(&mut model, 125, &control);
        assert!(!model.deceased);
        assert!(wave.iter().any(|sample| *sample > 0.5));
        let packet = continuous_packet(&model, wave, 0.0, 1, "test", &control);
        let weight = packet["measurements"]
            .as_array()
            .unwrap()
            .iter()
            .find(|item| item["code"] == "weight")
            .unwrap();
        assert_eq!(weight["value"], 0.0);
        assert_eq!(weight["unit"], "kg");
        model.deceased = true;
        let wave = advance_controlled(&mut model, 125, &control);
        let packet = continuous_packet(&model, wave, 1.0, 2, "test", &control);
        let weight = packet["measurements"]
            .as_array()
            .unwrap()
            .iter()
            .find(|item| item["code"] == "weight")
            .unwrap();
        assert_eq!(weight["value"], 0.0);
        assert_eq!(model.weight, 64.0);
    }

    #[test]
    fn temperature_is_an_explicit_per_crew_examination_fixture() {
        for crew in 0..3 {
            let mut model = Physiology::new(42, crew);
            let command = ExamCommand {
                id: "temp".into(),
                astronaut_id: CREW_IDS[crew].into(),
                kind: "BODY_TEMPERATURE".into(),
                device_id: "DEMO-TEMP-001".into(),
            };
            let packet = exam_packet(&command, &model, 1, "test", "playback");
            assert_eq!(packet["measurements"][0]["code"], "body_temperature");
            assert_eq!(
                packet["measurements"][0]["value"],
                (366.0 + crew as f64) / 10.0
            );
            assert_eq!(packet["measurements"][0]["unit"], "°C");
            assert_eq!(packet["examination_id"], "temp");
            model.advance(125 * 60, Activity::Exercise, "NONE");
            assert_eq!(
                packet["measurements"],
                exam_packet(&command, &model, 2, "test", "playback")["measurements"]
            );
            assert!(
                summaries(&model, false)
                    .iter()
                    .all(|measurement| measurement.code != "body_temperature")
            );
        }
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
                .all(|m| !matches!(m.code, "wbc" | "hemoglobin" | "bone_density"))
        );
    }
}
