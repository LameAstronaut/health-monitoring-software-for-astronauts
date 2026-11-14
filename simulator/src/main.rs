use std::{error::Error, time::Duration};

use astra_simulator::{Scenario, packet};
use clap::Parser;
use reqwest::{Client, StatusCode};
use serde_json::Value;
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
    let url = reqwest::Url::parse(&config.api_url)?;
    if !matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]")) {
        return Err("Demo simulator only permits localhost API destinations".into());
    }
    let base = config.api_url.trim_end_matches('/');
    let client = Client::builder()
        .timeout(Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::none())
        .build()?;
    // Resume the durable sequence; never silently reset ordering on restart.
    let history: Vec<Value> = client
        .get(format!("{base}/api/v1/observations?limit=1"))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let mut sequence = history
        .last()
        .and_then(|o| o["sequence"].as_u64())
        .map_or(0, |s| s + 1);
    let run = Uuid::new_v4().simple().to_string();
    let mut tick = 0;
    loop {
        if config.count != 0 && tick >= config.count {
            return Ok(());
        }
        if config.scenario == Scenario::SensorDisconnect && tick >= 5 {
            if tick == 5 {
                eprintln!("SIMULATED sensor disconnected: no further packets sent");
            }
        } else {
            let data = packet(config.seed, tick, sequence, config.scenario, &run);
            let mut accepted = false;
            for attempt in 0..4 {
                let response = client
                    .post(format!("{base}/api/v1/telemetry"))
                    .header("X-Demo-Token", &config.demo_token)
                    .json(&data)
                    .send()
                    .await;
                match response {
                    Ok(response) if response.status().is_success() => {
                        println!(
                            "SIMULATED sequence={sequence} scenario={}",
                            data.scenario_id
                        );
                        accepted = true;
                        break;
                    }
                    Ok(response) if response.status().is_client_error() => {
                        if config.scenario == Scenario::InvalidPacket
                            && tick == 5
                            && response.status() == StatusCode::UNPROCESSABLE_ENTITY
                        {
                            eprintln!(
                                "Expected invalid fixture rejected: {}",
                                response.text().await?
                            );
                            accepted = true;
                            break;
                        }
                        return Err(format!(
                            "Packet rejected: {} {}",
                            response.status(),
                            response.text().await?
                        )
                        .into());
                    }
                    Ok(response) => {
                        eprintln!("API returned {}; retry {attempt}", response.status())
                    }
                    Err(error) => eprintln!("Transport failed: {error}; retry {attempt}"),
                }
                tokio::time::sleep(Duration::from_millis(250 * (1 << attempt))).await;
            }
            if !accepted {
                return Err(
                    "Retry budget exhausted; stopped rather than discarding telemetry".into(),
                );
            }
            sequence += 1;
        }
        tick += 1;
        tokio::time::sleep(Duration::from_secs_f64(1.0 / config.rate_hz)).await;
    }
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
