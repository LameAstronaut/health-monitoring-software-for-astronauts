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
    #[serde(default = "default_systolic")]
    pub systolic_bp: f64,
    #[serde(default = "default_diastolic")]
    pub diastolic_bp: f64,
    /// Latest completed synthetic sleep period in hours; not a live accumulator.
    #[serde(default = "default_sleep_duration")]
    pub sleep_duration: f64,
    /// Latest synthetic body mass in kilograms; stable between recordings.
    #[serde(default = "default_weight")]
    pub weight: f64,
    pub ecg_phase: f64,
    pub activity: Activity,
    #[serde(default)]
    pub deceased: bool,
}

fn default_weight() -> f64 {
    70.0
}

fn default_sleep_duration() -> f64 {
    7.5
}

fn default_systolic() -> f64 {
    118.0
}
fn default_diastolic() -> f64 {
    76.0
}

#[cfg(test)]
mod blood_pressure_tests {
    use super::*;

    #[test]
    fn pressures_follow_exercise_recover_and_resume_deterministically() {
        for crew in 0..3 {
            let mut model = Physiology::new(42, crew);
            let baseline = model.clone();
            model.advance(125 * 300, Activity::Exercise, "NONE");
            assert!(model.systolic_bp > baseline.systolic_bp + 25.0);
            assert!(model.diastolic_bp > baseline.diastolic_bp + 3.0);
            let mut resumed: Physiology =
                serde_json::from_str(&serde_json::to_string(&model).unwrap()).unwrap();
            model.advance(125 * 600, Activity::Recovery, "NONE");
            resumed.advance(125 * 600, Activity::Recovery, "NONE");
            assert_eq!(model, resumed);
            assert!((model.systolic_bp - baseline.systolic_bp).abs() < 9.0);
            assert!((model.diastolic_bp - baseline.diastolic_bp).abs() < 4.0);
            assert!(model.systolic_bp > model.diastolic_bp);
        }
    }
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
            systolic_bp: 118.0 + crew_index as f64 * 2.0,
            diastolic_bp: 76.0 + crew_index as f64,
            sleep_duration: [7.5, 7.0, 8.0][crew_index],
            weight: [64.0, 78.0, 82.0][crew_index],
            ecg_phase: 0.0,
            activity: Activity::Rest,
            deceased: false,
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
                // Seeded oscillations model shared breathing variation and slower drift.
                // They are evaluated from logical time so chunking and replay stay exact.
                let breathing = (TAU * t * baseline_rr / 60.0 + phase).sin();
                let drift = (TAU * t / 24.0 + phase * 0.7).sin();
                // A second, incommensurate rhythm prevents an identical repeating sweep.
                let variation = (TAU * t / 7.3 + phase * 1.3).sin();
                let anomaly = activity == Activity::Anomaly;
                let pulse = anomaly && matches!(fault, "PULSE_SURGE" | "MULTI_SYSTEM");
                let pulse_decrease = anomaly && fault == "PULSE_DECREASE";
                let respiratory = anomaly && matches!(fault, "RESPIRATORY_SURGE" | "MULTI_SYSTEM");
                // Acute fixtures have their own bounded onset; exercise/recovery keep
                // the slow workload dynamics. These are illustrative, unvalidated rates.
                if !self.deceased {
                    let hr_target = baseline_hr
                        + if pulse_decrease {
                            -35.0
                        } else if pulse {
                            65.0
                        } else if respiratory {
                            20.0
                        } else {
                            workload * 65.0
                        }
                        + 4.0 * drift
                        + 0.8 * breathing
                        + 0.6 * variation;
                    self.heart_rate = approach(
                        self.heart_rate,
                        hr_target,
                        dt,
                        if pulse || pulse_decrease {
                            8.0
                        } else if respiratory {
                            10.0
                        } else if exercising {
                            25.0
                        } else if activity == Activity::Recovery {
                            35.0
                        } else {
                            1.8
                        },
                        if pulse {
                            4.0
                        } else if pulse_decrease {
                            2.0
                        } else {
                            1.8
                        },
                    );
                    // Respiratory demand follows the modeled HR load, with its own lag.
                    let rr_target = baseline_rr
                        + 0.18 * (self.heart_rate - baseline_hr).max(0.0)
                        + 0.8 * workload
                        + if respiratory { 22.0 } else { 0.0 }
                        + 1.2 * (TAU * t / 11.0 + phase).sin()
                        + 0.2 * breathing
                        + 0.15 * variation;
                    self.respiratory_rate = approach(
                        self.respiratory_rate,
                        rr_target,
                        dt,
                        if respiratory {
                            8.0
                        } else if pulse {
                            10.0
                        } else {
                            2.2
                        },
                        if respiratory {
                            1.0
                        } else if pulse {
                            0.8
                        } else {
                            0.6
                        },
                    );
                    // Synthetic pressure follows modeled cardiovascular load with a smooth lag.
                    let load = (self.heart_rate - baseline_hr).max(0.0);
                    let pulse_wave = 0.55 * drift + 0.3 * breathing + 0.15 * variation;
                    self.systolic_bp = approach(
                        self.systolic_bp,
                        118.0 + self.crew_index as f64 * 2.0 + 0.55 * load + 5.0 * pulse_wave,
                        dt,
                        2.4,
                        1.8,
                    );
                    self.diastolic_bp = approach(
                        self.diastolic_bp,
                        76.0 + self.crew_index as f64 + 0.08 * load + 2.5 * pulse_wave,
                        dt,
                        2.8,
                        0.8,
                    );
                    let oxygen = anomaly && matches!(fault, "OXYGEN" | "BOTH" | "MULTI_SYSTEM");
                    self.spo2 = approach(
                        self.spo2,
                        if oxygen {
                            86.0
                        } else {
                            98.2 - workload * 0.3 + 0.45 * drift + 0.2 * breathing + 0.1 * variation
                        },
                        dt,
                        if oxygen { 12.0 } else { 2.5 },
                        if oxygen { 0.5 } else { 0.2 },
                    );
                } else {
                    // Illustrative terminal/asystole fixture, not clinical timing.
                    self.heart_rate = 0.0;
                    self.respiratory_rate = terminal_decay(self.respiratory_rate, dt, 3.0, 4.0);
                    self.systolic_bp = terminal_decay(self.systolic_bp, dt, 1.5, 60.0);
                    self.diastolic_bp = terminal_decay(self.diastolic_bp, dt, 1.5, 40.0);
                    // SpO2 retains its last estimate internally; publication marks it INVALID.
                }
                let pressure = anomaly && matches!(fault, "PRESSURE" | "BOTH" | "MULTI_SYSTEM");
                // Clearing a pressure fault enables a faster synthetic refill, then
                // returns to the ordinary smooth resting response near baseline.
                let refilling = !pressure && self.suit_pressure < 29.5;
                self.suit_pressure = approach(
                    self.suit_pressure,
                    if pressure {
                        20.0
                    } else {
                        30.0 + 0.22 * drift + 0.1 * breathing + 0.04 * variation
                    },
                    dt,
                    if pressure {
                        9.0
                    } else if refilling {
                        0.8
                    } else {
                        2.0
                    },
                    if pressure {
                        0.6
                    } else if refilling {
                        4.0
                    } else {
                        0.18
                    },
                );
            }
            if self.deceased {
                ecg.push(0.0);
                continue;
            }
            self.ecg_phase = (self.ecg_phase + self.heart_rate / 60.0 / ECG_HZ as f64) % 1.0;
            ecg.push(ecg_shape(
                self.ecg_phase,
                self.heart_rate,
                self.respiratory_rate,
                self.elapsed(),
                self.seed,
                self.crew_index,
            ));
        }
        ecg
    }
}

fn terminal_decay(value: f64, dt: f64, tau: f64, max_rate: f64) -> f64 {
    let next = approach(value, 0.0, dt, tau, max_rate);
    if next < 0.05 { 0.0 } else { next }
}

fn approach(value: f64, target: f64, dt: f64, tau: f64, max_rate: f64) -> f64 {
    value + ((target - value) * (1.0 - (-dt / tau).exp())).clamp(-max_rate * dt, max_rate * dt)
}

// PQRST-inspired synthetic morphology, not a diagnostic lead or an ECGSYN implementation.
fn ecg_shape(phase: f64, hr: f64, rr: f64, time: f64, seed: u64, crew: usize) -> f64 {
    let period = 60.0 / hr.max(1.0);
    let timing = (period / 0.9).sqrt().clamp(0.65, 1.25);
    let r_center = 0.32;
    // Use circular phase distance so there is no discontinuity between beats.
    let bump = |offset: f64, left: f64, right: f64| {
        // Keep QRS duration stable; shorten P/T spacing as the beat interval decreases.
        let spacing = if offset.abs() < 0.04 { 1.0 } else { timing };
        let center = r_center + offset * spacing / period;
        let seconds = ((phase - center + 0.5).rem_euclid(1.0) - 0.5) * period;
        let width = if seconds < 0.0 { left } else { right };
        (-0.5 * (seconds / width).powi(2)).exp()
    };
    let seed_phase = (seed % 997) as f64 / 997.0 * TAU + crew as f64 * 0.7;
    let respiration = (TAU * time * rr / 60.0 + seed_phase).sin();
    let amplitude = 1.0 + 0.035 * respiration + 0.015 * (TAU * time / 9.7 + seed_phase).sin();
    let pqrst = 0.12 * bump(-0.17, 0.025, 0.030) - 0.13 * bump(-0.025, 0.007, 0.008)
        + 1.05 * bump(0.0, 0.009, 0.011)
        - 0.24 * bump(0.028, 0.010, 0.013)
        + 0.28 * bump(0.25, 0.045 * timing, 0.065 * timing);
    let wander = 0.018 * respiration + 0.008 * (TAU * time / 13.0 + seed_phase).sin();
    let texture = 0.002 * (TAU * time * 17.0 + seed_phase).sin()
        + 0.001 * (TAU * time * 29.0 + seed_phase * 1.7).sin();
    amplitude * pqrst + wander + texture
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn published_resting_values_vary_visibly_without_jumps() {
        for seed in [0, 42, 73] {
            for crew in 0..3 {
                let mut model = Physiology::new(seed, crew);
                let mut lows = [f64::INFINITY; 8];
                let mut highs = [f64::NEG_INFINITY; 8];
                let mut previous = crate::runtime::summaries(&model, false);
                for _ in 0..90 {
                    model.advance(125, Activity::Rest, "NONE");
                    let readings = crate::runtime::summaries(&model, false);
                    for (i, reading) in readings.iter().enumerate() {
                        lows[i] = lows[i].min(reading.value);
                        highs[i] = highs[i].max(reading.value);
                        let bound = [1.9, 0.7, 0.3, 0.3, 1.9, 0.9, 0.0, 0.0][i];
                        assert!((reading.value - previous[i].value).abs() <= bound + 1e-9);
                    }
                    assert!(model.systolic_bp > model.diastolic_bp);
                    previous = readings;
                }
                for (i, minimum_span) in [4.0, 1.0, 0.5, 0.2, 3.0, 1.5, 0.0, 0.0].iter().enumerate()
                {
                    assert!(
                        highs[i] - lows[i] >= *minimum_span - 1e-9,
                        "metric {i} barely changed for seed {seed}, crew {crew}"
                    );
                }
            }
        }
    }

    #[test]
    fn acute_trajectories_leave_time_for_early_warning() {
        for seed in [0, 42, 73] {
            for crew in 0..3 {
                for (fault, code, warning, threshold, falling) in [
                    ("OXYGEN", "spo2", 96.0, 92.0, true),
                    ("PRESSURE", "suit_pressure", 28.0, 25.0, true),
                    ("PULSE_SURGE", "heart_rate", 100.0, 115.0, false),
                    ("PULSE_DECREASE", "heart_rate", 55.0, 45.0, true),
                    ("RESPIRATORY_SURGE", "respiratory_rate", 20.0, 26.0, false),
                ] {
                    let mut model = Physiology::new(seed, crew);
                    let mut warned_at = None;
                    let mut triggered_at = None;
                    for second in 1..=30 {
                        model.advance(125, Activity::Anomaly, fault);
                        let readings = crate::runtime::summaries(&model, false);
                        let value = readings.iter().find(|r| r.code == code).unwrap().value;
                        let in_band = if falling {
                            value <= warning && value > threshold
                        } else {
                            value >= warning && value < threshold
                        };
                        if in_band && warned_at.is_none() {
                            warned_at = Some(second);
                        }
                        if if falling {
                            value <= threshold
                        } else {
                            value >= threshold
                        } {
                            triggered_at = Some(second);
                            break;
                        }
                    }
                    assert!(
                        triggered_at.unwrap() - warned_at.unwrap() >= 2,
                        "no early-warning lead time for {fault}, crew {crew}, seed {seed}"
                    );
                }
            }
        }
    }

    #[test]
    fn clearing_pressure_fault_refills_quickly_without_a_jump() {
        for seed in [0, 42, 73] {
            for crew in 0..3 {
                for fault in ["PRESSURE", "BOTH", "MULTI_SYSTEM"] {
                    let mut model = Physiology::new(seed, crew);
                    model.advance(125 * 60, Activity::Anomaly, fault);
                    assert!(model.suit_pressure < 20.2);
                    let low = model.suit_pressure;
                    // The UI clears the fault while leaving the scenario in ANOMALY.
                    for _ in 0..25 {
                        let before = model.suit_pressure;
                        model.advance(5, Activity::Anomaly, "NONE");
                        assert!(model.suit_pressure > before);
                        assert!(model.suit_pressure - before <= 4.0 * 0.04 + 1e-9);
                    }
                    assert!(model.suit_pressure - low > 3.0);
                    model.advance(125 * 7, Activity::Anomaly, "NONE");
                    assert!((model.suit_pressure - 30.0).abs() <= 0.35);
                    assert!(model.suit_pressure < 30.4);
                }
            }
        }
    }

    #[test]
    fn rest_is_stable_and_individual() {
        let mut model = Physiology::new(42, 0);
        for _ in 0..60 {
            let before = model.heart_rate;
            model.advance(125, Activity::Rest, "NONE");
            assert!((model.heart_rate - before).abs() <= 3.001);
            assert!((model.heart_rate - 68.0).abs() < 7.3);
            assert!((model.spo2 - 98.2).abs() < 0.8);
        }
        assert_ne!(model.heart_rate, Physiology::new(42, 1).heart_rate);
    }
    #[test]
    fn exercise_and_recovery_are_gradual_and_correlated() {
        let mut m = Physiology::new(42, 0);
        for _ in 0..180 {
            let previous = m.heart_rate;
            m.advance(125, Activity::Exercise, "NONE");
            assert!(m.heart_rate - previous <= 3.001);
        }
        assert!(m.heart_rate > 120.0 && m.respiratory_rate > 22.0);
        let peak = m.heart_rate;
        m.advance(125, Activity::Recovery, "NONE");
        assert!(m.heart_rate < peak && m.heart_rate > peak - 3.001);
        m.advance(125 * 300, Activity::Recovery, "NONE");
        assert!((m.heart_rate - 68.0).abs() < 7.3);
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
    fn ecg_morphology_varies_smoothly_and_wraps_between_beats() {
        for hr in [55.0, 75.0, 130.0] {
            let period = 60.0 / hr;
            let timing = (period / 0.9_f64).sqrt().clamp(0.65, 1.25);
            let at = |offset: f64| {
                ecg_shape(
                    (0.32 + offset * if offset.abs() < 0.04 { 1.0 } else { timing } / period)
                        .rem_euclid(1.0),
                    hr,
                    13.0,
                    1.0,
                    42,
                    0,
                )
            };
            assert!(at(-0.17) > 0.05); // P
            assert!(at(0.0) > 0.8); // R
            assert!(at(0.028) < -0.05); // S
            assert!(at(0.25) > 0.15); // broad T
            let before = ecg_shape(1.0 - 1e-8, hr, 13.0, 1.0, 42, 0);
            let after = ecg_shape(0.0, hr, 13.0, 1.0, 42, 0);
            assert!((before - after).abs() < 1e-5);
        }
        let first = ecg_shape(0.32, 68.0, 13.0, 1.0, 42, 0);
        let later = ecg_shape(0.32, 68.0, 13.0, 3.0, 42, 0);
        assert!((first - later).abs() > 0.005);
    }

    #[test]
    fn ecg_is_continuous_and_separate_from_summary_values() {
        let mut a = Physiology::new(42, 0);
        let wave = a.advance(125, Activity::Rest, "NONE");
        assert_eq!(wave.len(), 125);
        assert!(wave.iter().any(|v| *v > 0.5));
        assert!(wave.iter().all(|v| v.is_finite() && *v < 1.2 && *v > -0.4));
        assert_eq!(a.ticks, 125);
        assert!((a.heart_rate - 68.0).abs() <= 3.0);
    }

    #[test]
    fn added_anomalies_are_seeded_gradual_and_recoverable() {
        for crew in 0..3 {
            for fault in [
                "PULSE_SURGE",
                "PULSE_DECREASE",
                "RESPIRATORY_SURGE",
                "MULTI_SYSTEM",
            ] {
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
                    assert!((model.spo2 - 98.2).abs() < 0.8);
                    assert!((model.suit_pressure - 30.0).abs() < 0.4);
                } else if fault == "PULSE_DECREASE" {
                    assert!(model.heart_rate <= 45.0 && model.heart_rate > 20.0);
                    assert!(model.respiratory_rate < 26.0);
                } else {
                    assert!(model.respiratory_rate >= 26.0);
                }
                if fault == "MULTI_SYSTEM" {
                    assert!(model.heart_rate >= 115.0 && model.spo2 <= 92.0);
                    assert!(model.suit_pressure <= 25.0);
                }
                model.advance(125 * 600, Activity::Recovery, "NONE");
                let baseline = Physiology::new(73, crew);
                assert!((model.heart_rate - baseline.heart_rate).abs() < 7.3);
                assert!((model.respiratory_rate - baseline.respiratory_rate).abs() < 3.2);
            }
        }
    }

    #[test]
    fn acute_onsets_reach_markers_in_seconds_without_sample_jumps() {
        for seed in [0, 42, 73] {
            for crew in 0..3 {
                for fault in [
                    "PULSE_SURGE",
                    "PULSE_DECREASE",
                    "RESPIRATORY_SURGE",
                    "OXYGEN",
                    "PRESSURE",
                    "MULTI_SYSTEM",
                ] {
                    let mut model = Physiology::new(seed, crew);
                    for _ in 0..20 * 25 {
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
                        "PULSE_DECREASE" => assert!(model.heart_rate <= 45.0),
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
