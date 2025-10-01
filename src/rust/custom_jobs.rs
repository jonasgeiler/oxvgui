use oxvg_ast::{
    element::Element,
    visitor::{Info, PrepareOutcome, Visitor},
};
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use std::fmt::Display;
use tsify::Tsify;

use crate::extract_dimensions::ExtractDimensions;

#[skip_serializing_none]
#[derive(Tsify)]
#[tsify(from_wasm_abi, into_wasm_abi)]
#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
/// Custom implementation of Jobs.
/// Based on:
/// - https://github.com/noahbald/oxvg/blob/94b2abbc1126ca4056d4bb4d14b3ad24f376db15/crates/oxvg_optimiser/src/jobs/mod.rs
pub struct CustomJobs {
    #[doc = concat!( "See [`", stringify!( ExtractDimensions ), "`]" )]
    pub extract_dimensions: ExtractDimensions,
}

#[derive(Debug)]
/// The type of errors which may occur while analysing a document.
pub enum Error {
    /// A basic error message created by one of the jobs.
    Generic(String),
}

impl Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Generic(s) => s.fmt(f),
        }
    }
}

impl std::error::Error for Error {}

impl CustomJobs {
    ///   Runs each custom job, returning the number of non-skipped jobs
    fn run_jobs<'arena, E: Element<'arena>>(
        &self,
        element: &mut E,
        info: &Info<'arena, E>,
    ) -> Result<usize, String> {
        let mut count = 0;
        if !self
            .extract_dimensions
            .start(element, info, None)?
            .contains(PrepareOutcome::skip)
        {
            count += 1;
        }
        Ok(count)
    }

    /// # Errors
    /// When any custom job fails for the first time
    pub fn run<'arena, E: Element<'arena>>(
        &self,
        root: &E::ParentChild,
        info: &Info<'arena, E>,
    ) -> Result<(), Error> {
        let Some(mut root_element) = <E as Element>::from_parent(root.clone()) else {
            log::warn!("No elements found in the document, skipping");
            return Ok(());
        };

        let count = self
            .run_jobs(&mut root_element, info)
            .map_err(Error::Generic)?;
        log::debug!("completed {count} jobs");
        Ok(())
    }
}

impl Default for CustomJobs {
    fn default() -> Self {
        Self {
            extract_dimensions: ExtractDimensions::default(),
        }
    }
}
