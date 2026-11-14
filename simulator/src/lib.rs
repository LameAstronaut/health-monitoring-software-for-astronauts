use chrono::{DateTime, Utc};
use clap::ValueEnum;
use serde::Serialize;
pub mod physiology;
pub mod runtime;

#[derive(Clone, Copy, Debug, PartialEq, Eq, ValueEnum)]
#[clap(rename_all = "snake_case")]
pub enum Scenario {
    #[value(alias = "REST", alias = "rest")]
    Normal,
    #[value(alias = "EXERCISE")]
    Exercise,
    #[value(alias = "RECOVERY")]
    Recovery,
    #[value(alias = "ANOMALY")]
    Anomaly,
    OxygenDropDemo,
    PressureAnomalyDemo,
    SimultaneousDemo,
    SensorDisconnect,
    InvalidPacket,
}

impl Scenario {
    pub fn id(self) -> &'static str {
        match self {
            Self::Exercise => "EXERCISE",
            Self::Recovery => "RECOVERY",
            Self::Anomaly => "ANOMALY",
            Self::Normal | Self::SensorDisconnect | Self::InvalidPacket => "normal",
            Self::OxygenDropDemo => "oxygen_drop_demo",
            Self::PressureAnomalyDemo => "pressure_anomaly_demo",
            Self::SimultaneousDemo => "simultaneous_demo",
        }
    }
}

#[derive(Debug, Serialize, PartialEq)]
pub struct Measurement {
    pub code: &'static str,
    pub value: f64,
    pub unit: &'static str,
    pub quality: &'static str,
}

#[derive(Debug, Serialize)]
pub struct Packet {
    pub schema_version: &'static str,
    pub event_id: String,
    pub sequence: u64,
    pub observed_at: DateTime<Utc>,
    pub astronaut_id: &'static str,
    pub device_id: &'static str,
    pub source_type: &'static str,
    pub scenario_id: &'static str,
    pub measurements: Vec<Measurement>,
}

/// Reproducible demo values. No physiological or spacesuit model is claimed.
pub fn measurements(seed: u64, tick: u64, scenario: Scenario) -> Vec<Measurement> {
    let mut model = physiology::Physiology::new(seed, 0);
    let (activity, fault) = runtime::activity_for(scenario);
    model.advance(((tick + 1) * 125) as usize, activity, fault);
    runtime::summaries(&model, false)
}

pub fn packet(seed: u64, tick: u64, sequence: u64, scenario: Scenario, run: &str) -> Packet {
    let mut data = measurements(seed, tick, scenario);
    if scenario == Scenario::InvalidPacket && tick == 5 {
        data[0].unit = "unsupported-demo-unit";
    }
    Packet {
        schema_version: "1.0",
        event_id: format!("demo-{run}-{sequence}"),
        sequence,
        observed_at: Utc::now(),
        astronaut_id: "DEMO-CREW-001",
        device_id: "DEMO-SUIT-001",
        source_type: "SIMULATED",
        scenario_id: scenario.id(),
        measurements: data,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seeded_values_repeat() {
        for tick in 0..100 {
            assert_eq!(
                measurements(42, tick, Scenario::Normal),
                measurements(42, tick, Scenario::Normal)
            );
        }
        assert_ne!(
            measurements(42, 60, Scenario::Normal),
            measurements(43, 60, Scenario::Normal)
        );
    }

    #[test]
    fn faults_are_gradual_and_seeded() {
        let first = measurements(42, 0, Scenario::SimultaneousDemo);
        let later = measurements(42, 120, Scenario::SimultaneousDemo);
        assert!(first[2].value > later[2].value);
        assert!(first[3].value > later[3].value);
        assert_eq!(later, measurements(42, 120, Scenario::SimultaneousDemo));
    }

    #[test]
    fn serialized_contract_has_provenance() {
        let value = serde_json::to_value(packet(42, 0, 10, Scenario::Normal, "test")).unwrap();
        assert_eq!(value["sequence"], 10);
        assert_eq!(value["source_type"], "SIMULATED");
        assert_eq!(value["measurements"][0]["unit"], "beats/min");
        assert_eq!(value["event_id"], "demo-test-10");
    }

    #[test]
    fn invalid_fixture_keeps_explicit_source() {
        let value = packet(42, 5, 5, Scenario::InvalidPacket, "test");
        assert_eq!(value.measurements[0].unit, "unsupported-demo-unit");
        assert_eq!(value.source_type, "SIMULATED");
    }
}
