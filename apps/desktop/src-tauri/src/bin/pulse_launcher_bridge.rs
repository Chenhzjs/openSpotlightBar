fn main() {
    if let Err(error) = pulse_launcher_lib::bridge::run_cli() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
