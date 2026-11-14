//! Deliberately simplified fixture dynamics, not a clinical or astronaut-specific model.
use serde::{Deserialize, Serialize};
use std::f64::consts::TAU;

pub const ECG_HZ: u32 = 125;
pub const CREW_IDS: [&str; 3] = ["DEMO-CREW-001", "DEMO-CREW-002", "DEMO-CREW-003"];

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum Activity {
    Rest,
    Exercise,
    Recovery,
    Anomaly,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Physiology {
    pub seed: u64,
    pub crew_index: usize,
    pub ticks: u64,
    pub heart_rate: f64,
    pub respiratory_rate: f64,
    pub spo2: f64,
    pub suit_pressure: f64,
    pub ecg_phase: f64,
    pub activity: Activity,
}

impl Physiology {
    pub fn new(seed: u64, crew_index: usize) -> Self {
        Self {
            seed,
            crew_index,
            ticks: 0,
            heart_rate: [68.0, 72.0, 64.0][crew_index],
            respiratory_rate: [13.0, 14.0, 12.0][crew_index],
            spo2: 98.2,
            suit_pressure: 30.0,
            ecg_phase: 0.0,
            activity: Activity::Rest,
        }
    }

    pub fn elapsed(&self) -> f64 {
        self.ticks as f64 / ECG_HZ as f64
    }

    /// ECG is sampled at 125 Hz; state integration runs at 25 Hz. Numeric publication
    /// and wall-clock speed are the caller's responsibility and do not change the model.
    pub fn advance(&mut self, samples: usize, activity: Activity, fault: &str) -> Vec<f64> {
        self.activity = activity;
        let mut ecg = Vec::with_capacity(samples);
        for _ in 0..samples {
            self.ticks += 1;
            if self.ticks.is_multiple_of(5) {
                let dt = 0.04;
                let t = self.elapsed();
                let phase = (self
                    .seed
                    .wrapping_mul(17)
                    .wrapping_add(self.crew_index as u64 * 31)
                    % 360) as f64;
                let baseline_hr = [68.0, 72.0, 64.0][self.crew_index];
                let baseline_rr = [13.0, 14.0, 12.0][self.crew_index];
                let exercising = activity == Activity::Exercise;
                let workload = if exercising { 1.0 } else { 0.0 };
                let anomaly = activity == Activity::Anomaly;
                let pulse = anomaly && matches!(fault, "PULSE_SURGE" | "MULTI_SYSTEM");
                let respiratory = anomaly && matches!(fault, "RESPIRATORY_SURGE" | "MULTI_SYSTEM");
                // Acute fixtures have their own bounded onset; exercise/recovery keep
                // the slow workload dynamics. These are illustrative, unvalidated rates.
                let hr_target = baseline_hr
                    + if pulse {
                        65.0
                    } else if respiratory {
                        20.0
                    } else {
                        workload * 65.0
                    }
                    + 0.28 * (t / 27.0 + phase).sin()
                    + 0.12 * (t / 11.0 + phase).sin();
                self.heart_rate = approach(
                    self.heart_rate,
                    hr_target,
                    dt,
                    if pulse {
                        6.0
                    } else if respiratory {
                        10.0
                    } else if exercising {
                        45.0
                    } else {
                        65.0
                    },
                    if pulse {
                        8.0
                    } else if respiratory {
                        3.0
                    } else {
                        0.9
                    },
                );
                // Respiratory demand follows the modeled HR load, with its own lag.
                let rr_target = baseline_rr
                    + 0.18 * (self.heart_rate - baseline_hr).max(0.0)
                    + 0.8 * workload
                    + if respiratory { 22.0 } else { 0.0 }
                    + 0.08 * (t / 19.0 + phase).sin();
                self.respiratory_rate = approach(
                    self.respiratory_rate,
                    rr_target,
                    dt,
                    if respiratory {
                        6.0
                    } else if pulse {
                        10.0
                    } else {
                        22.0
                    },
                    if respiratory {
                        1.8
                    } else if pulse {
                        0.8
                    } else {
                        0.3
                    },
                );
                let oxygen = anomaly && matches!(fault, "OXYGEN" | "BOTH" | "MULTI_SYSTEM");
                let pressure = anomaly && matches!(fault, "PRESSURE" | "BOTH" | "MULTI_SYSTEM");
                self.spo2 = approach(
                    self.spo2,
                    if oxygen {
                        86.0
                    } else {
                        98.2 - workload * 0.3 + 0.04 * (t / 31.0 + phase).sin()
                    },
                    dt,
                    if oxygen { 10.0 } else { 35.0 },
                    if oxygen { 0.8 } else { 0.18 },
                );
                self.suit_pressure = approach(
                    self.suit_pressure,
                    if pressure {
                        20.0
                    } else {
                        30.0 + 0.015 * (t / 37.0 + phase).sin()
                    },
                    dt,
                    if pressure { 5.0 } else { 30.0 },
                    if pressure { 1.2 } else { 0.15 },
                );
            }
            self.ecg_phase = (self.ecg_phase + self.heart_rate / 60.0 / ECG_HZ as f64) % 1.0;
            ecg.push(ecg_shape(self.ecg_phase));
        }
        ecg
    }
}

fn approach(value: f64, target: f64, dt: f64, tau: f64, max_rate: f64) -> f64 {
    value + ((target - value) * (1.0 - (-dt / tau).exp())).clamp(-max_rate * dt, max_rate * dt)
}

fn ecg_shape(phase: f64) -> f64 {
    let bump = |center: f64, width: f64| (-0.5 * ((phase - center) / width).powi(2)).exp();
    0.10 * bump(0.18, 0.035) - 0.13 * bump(0.37, 0.012) + 1.0 * bump(0.40, 0.009)
        - 0.22 * bump(0.43, 0.015)
        + 0.25 * bump(0.67, 0.06)
        + 0.008 * (phase * TAU).sin()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rest_is_stable_and_individual() {
        let mut model = Physiology::new(42, 0);
        for _ in 0..60 {
            let before = model.heart_rate;
            model.advance(125, Activity::Rest, "NONE");
            assert!((model.heart_rate - before).abs() < 0.03);
            assert!((model.heart_rate - 68.0).abs() < 0.5);
            assert!((model.spo2 - 98.2).abs() < 0.1);
        }
        assert_ne!(model.heart_rate, Physiology::new(42, 1).heart_rate);
    }
    #[test]
    fn exercise_and_recovery_are_gradual_and_correlated() {
        let mut m = Physiology::new(42, 0);
        for _ in 0..180 {
            let previous = m.heart_rate;
            m.advance(125, Activity::Exercise, "NONE");
            assert!(m.heart_rate - previous <= 0.901);
        }
        assert!(m.heart_rate > 120.0 && m.respiratory_rate > 22.0);
        let peak = m.heart_rate;
        m.advance(125, Activity::Recovery, "NONE");
        assert!(m.heart_rate < peak && m.heart_rate > peak - 1.0);
        m.advance(125 * 300, Activity::Recovery, "NONE");
        assert!((m.heart_rate - 68.0).abs() < 2.0);
    }
    #[test]
    fn seed_playback_and_checkpoint_resume_are_exact() {
        let mut a = Physiology::new(42, 2);
        let mut b = a.clone();
        let all = a.advance(1250, Activity::Anomaly, "BOTH");
        let mut chunks = Vec::new();
        for _ in 0..10 {
            chunks.extend(b.advance(125, Activity::Anomaly, "BOTH"));
        }
        assert_eq!(all, chunks);
        assert_eq!(a, b);
        let mut restored: Physiology =
            serde_json::from_str(&serde_json::to_string(&a).unwrap()).unwrap();
        assert_eq!(
            a.advance(125, Activity::Recovery, "NONE"),
            restored.advance(125, Activity::Recovery, "NONE")
        );
        assert_eq!(Physiology::new(42, 0).ticks, 0); // restart resets logical time
    }
    #[test]
    fn ecg_is_continuous_and_separate_from_summary_values() {
        let mut a = Physiology::new(42, 0);
        let wave = a.advance(125, Activity::Rest, "NONE");
        assert_eq!(wave.len(), 125);
        assert!(wave.iter().any(|v| *v > 0.5));
        assert!(wave.iter().all(|v| v.is_finite() && *v < 1.2 && *v > -0.4));
        assert_eq!(a.ticks, 125);
        assert!((a.heart_rate - 68.0).abs() < 0.05);
    }

    #[test]
    fn added_anomalies_are_seeded_gradual_and_recoverable() {
        for crew in 0..3 {
            for fault in ["PULSE_SURGE", "RESPIRATORY_SURGE", "MULTI_SYSTEM"] {
                let mut model = Physiology::new(73, crew);
                let mut replay = model.clone();
                for _ in 0..240 {
                    let before = model.clone();
                    model.advance(125, Activity::Anomaly, fault);
                    assert!((model.heart_rate - before.heart_rate).abs() <= 8.001);
                    assert!((model.respiratory_rate - before.respiratory_rate).abs() <= 1.801);
                    assert!((model.spo2 - before.spo2).abs() <= 0.801);
                    assert!((model.suit_pressure - before.suit_pressure).abs() <= 1.201);
                }
                replay.advance(125 * 240, Activity::Anomaly, fault);
                assert_eq!(model, replay);
                if fault == "PULSE_SURGE" {
                    assert!(model.heart_rate >= 115.0);
                    assert!(model.respiratory_rate < 26.0);
                    assert!((model.spo2 - 98.2).abs() < 0.1);
                    assert!((model.suit_pressure - 30.0).abs() < 0.1);
                } else {
                    assert!(model.respiratory_rate >= 26.0);
                }
                if fault == "MULTI_SYSTEM" {
                    assert!(model.heart_rate >= 115.0 && model.spo2 <= 92.0);
                    assert!(model.suit_pressure <= 25.0);
                }
                model.advance(125 * 600, Activity::Recovery, "NONE");
                let baseline = Physiology::new(73, crew);
                assert!((model.heart_rate - baseline.heart_rate).abs() < 0.5);
                assert!((model.respiratory_rate - baseline.respiratory_rate).abs() < 0.5);
            }
        }
    }

    #[test]
    fn acute_onsets_reach_markers_in_seconds_without_sample_jumps() {
        for seed in [0, 42, 73] {
            for crew in 0..3 {
                for fault in [
                    "PULSE_SURGE",
                    "RESPIRATORY_SURGE",
                    "OXYGEN",
                    "PRESSURE",
                    "MULTI_SYSTEM",
                ] {
                    let mut model = Physiology::new(seed, crew);
                    for _ in 0..12 * 25 {
                        let before = model.clone();
                        model.advance(5, Activity::Anomaly, fault);
                        assert!((model.heart_rate - before.heart_rate).abs() <= 8.0 * 0.04 + 1e-9);
                        assert!(
                            (model.respiratory_rate - before.respiratory_rate).abs()
                                <= 1.8 * 0.04 + 1e-9
                        );
                        assert!((model.spo2 - before.spo2).abs() <= 0.8 * 0.04 + 1e-9);
                        assert!(
                            (model.suit_pressure - before.suit_pressure).abs() <= 1.2 * 0.04 + 1e-9
                        );
                    }
                    match fault {
                        "PULSE_SURGE" => assert!(model.heart_rate >= 115.0),
                        "RESPIRATORY_SURGE" => assert!(model.respiratory_rate >= 26.0),
                        "OXYGEN" => assert!(model.spo2 <= 92.0),
                        "PRESSURE" => assert!(model.suit_pressure <= 25.0),
                        "MULTI_SYSTEM" => assert!(
                            model.heart_rate >= 115.0
                                && model.respiratory_rate >= 26.0
                                && model.spo2 <= 92.0
                                && model.suit_pressure <= 25.0
                        ),
                        _ => unreachable!(),
                    }
                }
            }
        }
    }
}
