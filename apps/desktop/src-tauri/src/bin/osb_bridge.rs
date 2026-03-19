fn main() {
    if let Err(error) = open_spotlight_bar_lib::bridge::run_cli() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
