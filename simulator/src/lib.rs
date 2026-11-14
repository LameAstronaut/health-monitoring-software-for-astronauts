use chrono::{DateTime, Utc};
use clap::ValueEnum;
use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, ValueEnum)]
#[clap(rename_all = "snake_case")]
pub enum Scenario {
    Normal,
    OxygenDropDemo,
    PressureAnomalyDemo,
    SimultaneousDemo,
    SensorDisconnect,
    InvalidPacket,
}

impl Scenario {
    pub fn id(self) -> &'static str {
        match self {
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
    let noise = seed.wrapping_add(tick).wrapping_mul(6364136223846793005);
    let fault = tick == 5;
    let oxygen = fault
        && matches!(
            scenario,
            Scenario::OxygenDropDemo | Scenario::SimultaneousDemo
        );
    let pressure = fault
        && matches!(
            scenario,
            Scenario::PressureAnomalyDemo | Scenario::SimultaneousDemo
        );
    vec![
        Measurement {
            code: "heart_rate",
            value: 70.0 + (noise % 7) as f64,
            unit: "beats/min",
            quality: "VALID",
        },
        Measurement {
            code: "spo2",
            value: if oxygen {
                88.0
            } else {
                97.0 + (noise % 3) as f64
            },
            unit: "%",
            quality: "VALID",
        },
        Measurement {
            code: "suit_pressure",
            value: if pressure {
                20.0
            } else {
                30.0 + (noise % 4) as f64 / 10.0
            },
            unit: "kPa",
            quality: "VALID",
        },
    ]
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
            measurements(42, 0, Scenario::Normal),
            measurements(43, 0, Scenario::Normal)
        );
    }

    #[test]
    fn faults_are_one_sample_fixtures() {
        let both = measurements(42, 5, Scenario::SimultaneousDemo);
        assert_eq!(both[1].value, 88.0);
        assert_eq!(both[2].value, 20.0);
        assert_ne!(
            measurements(42, 6, Scenario::SimultaneousDemo)[1].value,
            88.0
        );
        assert_eq!(measurements(42, 5, Scenario::OxygenDropDemo)[1].value, 88.0);
        assert_eq!(
            measurements(42, 5, Scenario::PressureAnomalyDemo)[2].value,
            20.0
        );
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
