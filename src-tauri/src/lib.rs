mod accounts;
mod business;
pub mod db;
mod demo;
#[cfg(feature = "desktop")]
mod desktop;
mod management;
mod media;
mod reports;
pub use db::{Error, Result, Service};
#[cfg(feature = "desktop")]
pub use desktop::run;
