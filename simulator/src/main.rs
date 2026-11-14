use std::{error::Error, time::Duration};

use astra_simulator::Scenario;
use astra_simulator::physiology::{CREW_IDS, ECG_HZ, Physiology};
use astra_simulator::runtime::{self, Control};
use clap::Parser;
use reqwest::{Client, StatusCode};
use serde_json::{Value, json};
use uuid::Uuid;

#[derive(Parser, Debug)]
#[command(about = "ASTRA HEALTH — synthetic telemetry only; no hardware control")]
struct Config {
    #[arg(long, value_enum, default_value = "normal")]
    scenario: Scenario,
    #[arg(long, default_value_t = 42)]
    seed: u64,
    #[arg(long, default_value = "http://127.0.0.1:8000")]
    api_url: String,
    #[arg(long, default_value_t = 1.0)]
    rate_hz: f64,
    /// Number of ticks; zero runs until Ctrl+C.
    #[arg(long, default_value_t = 0)]
    count: u64,
    /// Follow durable UI controls; all three synthetic crew are published.
    #[arg(long)]
    controlled: bool,
    #[arg(long, default_value_t = 1.0)]
    speed: f64,
    #[arg(
        long,
        env = "ASTRA_DEMO_TOKEN",
        default_value = "local-demo-only",
        hide_env_values = true
    )]
    demo_token: String,
}

async fn run(config: Config) -> Result<(), Box<dyn Error>> {
    if !config.rate_hz.is_finite() || !(0.1..=20.0).contains(&config.rate_hz) {
        return Err("--rate-hz must be between 0.1 and 20".into());
    }
    if !config.speed.is_finite() || !(0.25..=4.0).contains(&config.speed) {
        return Err("--speed must be between 0.25 and 4".into());
    }
    let url = reqwest::Url::parse(&config.api_url)?;
    if !matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]")) {
        return Err("Demo simulator only permits localhost API destinations".into());
    }
    let base = config.api_url.trim_end_matches('/');
    let client = Client::builder()
        .timeout(Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::none())
        .build()?;
    let initial = runtime::load(&client, base, &config.demo_token).await?;
    let mut sequences = initial.next_sequences;
    let mut models: Vec<Physiology> = (0..3)
        .map(|index| {
            if config.controlled {
                initial
                    .checkpoints
                    .get(CREW_IDS[index])
                    .cloned()
                    .unwrap_or_else(|| Physiology::new(initial.control.seed, index))
            } else {
                Physiology::new(config.seed, index)
            }
        })
        .collect();
    let (activity, fault) = runtime::activity_for(config.scenario);
    let mut control = if config.controlled {
        initial.control
    } else {
        Control {
            manual_values: Default::default(),
            scenario: activity,
            astronaut_id: CREW_IDS[0].into(),
            running: true,
            speed: config.speed,
            seed: config.seed,
            fault: fault.into(),
            revision: 0,
            run_id: "standalone".into(),
        }
    };
    let run = Uuid::new_v4().simple().to_string();
    if !config.controlled {
        control.run_id = format!("standalone-{run}");
    }
    let mut tick = 0;
    let mut remainder = 0.0;
    loop {
        if config.count != 0 && tick >= config.count {
            return Ok(());
        }
        let commands = if config.controlled {
            let current = runtime::load(&client, base, &config.demo_token).await?;
            if current.control.run_id != control.run_id {
                models = (0..3)
                    .map(|i| Physiology::new(current.control.seed, i))
                    .collect();
                remainder = 0.0;
            }
            control = current.control;
            let heartbeat = json!({"run_id":control.run_id, "revision":control.revision,
                "state":if control.running { "RUNNING" } else { "PAUSED" }, "source_type":"SIMULATED"});
            let response = client
                .post(format!("{base}/api/v1/demo/heartbeat"))
                .header("X-Demo-Token", &config.demo_token)
                .json(&heartbeat)
                .send()
                .await?;
            if response.status() == StatusCode::CONFLICT {
                continue; // operator changed revision while the worker was polling
            }
            response.error_for_status()?;
            current.pending_examinations
        } else {
            Vec::new()
        };
        if !control.running {
            tokio::time::sleep(Duration::from_secs_f64(1.0 / config.rate_hz)).await;
            continue; // no logical clock advance and no fabricated "fresh" packets while paused
        }
        let desired = ECG_HZ as f64 * control.speed / config.rate_hz + remainder;
        let samples = desired.floor() as usize;
        remainder = desired.fract();
        for (index, model) in
            models
                .iter_mut()
                .enumerate()
                .take(if config.controlled { 3 } else { 1 })
        {
            let selected = control.astronaut_id == CREW_IDS[index];
            let start = model.elapsed();
            let wave = runtime::advance_controlled(model, samples, &control);
            let disconnected = selected && control.fault == "DISCONNECT"
                || config.scenario == Scenario::SensorDisconnect && tick >= 5;
            if disconnected {
                continue;
            }
            let device_id = format!("DEMO-SUIT-00{}", index + 1);
            let sequence = *sequences.get(&device_id).unwrap_or(&0);
            let mut data = runtime::continuous_packet(model, wave, start, sequence, &run, &control);
            if config.scenario == Scenario::InvalidPacket && tick == 5 {
                data["measurements"][0]["unit"] = json!("unsupported-demo-unit");
            }
            if publish(
                &client,
                base,
                &config.demo_token,
                &data,
                config.scenario == Scenario::InvalidPacket && tick == 5,
            )
            .await?
            {
                sequences.insert(device_id, sequence + 1);
            }
        }
        for command in commands {
            if control.fault == "DISCONNECT" && command.astronaut_id == control.astronaut_id {
                continue;
            }
            let index = CREW_IDS
                .iter()
                .position(|id| *id == command.astronaut_id)
                .ok_or("Unknown crew in acquisition command")?;
            if models[index].deceased {
                continue;
            }
            let sequence = *sequences.get(&command.device_id).unwrap_or(&0);
            let data =
                runtime::exam_packet(&command, &models[index], sequence, &run, &control.run_id);
            if publish(&client, base, &config.demo_token, &data, false).await? {
                sequences.insert(command.device_id, sequence + 1);
            }
        }
        tick += 1;
        tokio::time::sleep(Duration::from_secs_f64(1.0 / config.rate_hz)).await;
    }
}

async fn publish(
    client: &Client,
    base: &str,
    token: &str,
    data: &Value,
    expected_invalid: bool,
) -> Result<bool, Box<dyn Error>> {
    for attempt in 0..4 {
        let response = client
            .post(format!("{base}/api/v1/telemetry"))
            .header("X-Demo-Token", token)
            .json(data)
            .send()
            .await;
        match response {
            Ok(response) if response.status().is_success() => {
                println!(
                    "SIMULATED {} sequence={} scenario={}",
                    data["astronaut_id"], data["sequence"], data["scenario_id"]
                );
                return Ok(true);
            }
            Ok(response) if response.status() == StatusCode::CONFLICT => {
                let detail = response.text().await?;
                if detail.contains("control revision changed") || detail.contains("Examination") {
                    eprintln!("Playback/acquisition changed: {detail}");
                    return Ok(false);
                }
                return Err(format!(
                    "Sequence or event conflict; ensure only one publisher is running: {detail}"
                )
                .into());
            }
            Ok(response)
                if expected_invalid && response.status() == StatusCode::UNPROCESSABLE_ENTITY =>
            {
                eprintln!("Expected invalid fixture rejected");
                return Ok(true);
            }
            Ok(response) if response.status().is_client_error() => {
                return Err(format!(
                    "Packet rejected: {} {}",
                    response.status(),
                    response.text().await?
                )
                .into());
            }
            Ok(response) => eprintln!("API returned {}; retry {attempt}", response.status()),
            Err(error) => eprintln!("Transport failed: {error}; retry {attempt}"),
        }
        tokio::time::sleep(Duration::from_millis(250 * (1 << attempt))).await;
    }
    Err("Retry budget exhausted; no replacement readings generated".into())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let config = Config::parse();
    tokio::select! {
        result = run(config) => result,
        result = tokio::signal::ctrl_c() => {
            result?;
            eprintln!("Stopped synthetic acquisition");
            Ok(())
        }
    }
}
