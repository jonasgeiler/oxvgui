use oxvg_ast::{
    element::Element,
    node::Ref,
    visitor::{Info, PrepareOutcome, Visitor},
};
use oxvg_optimiser::error::JobsError;
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use tsify::Tsify;

use crate::extract_dimensions::ExtractDimensions;

// Based on https://github.com/noahbald/oxvg/blob/e156479dd9d4634542fa9849a45253e089c8d150/crates/oxvg_optimiser/src/jobs/mod.rs
// Note that "serde" and "wasm" features are implied.
// Also, I have used RustRover to recursively expand the original source macro code and check it.
// And keep in mind that `extract_dimensions` is not an `Option<...>` here.

#[skip_serializing_none]
#[derive(Tsify)]
#[tsify(from_wasm_abi, into_wasm_abi)]
#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
/// Custom implementation of `Jobs` that only runs my `extract_dimensions` job.
pub struct CustomJobs {
    #[doc = concat!( "See [`", stringify!( ExtractDimensions ), "`]" )]
    pub extract_dimensions: ExtractDimensions,
}

impl Default for CustomJobs {
    fn default() -> Self {
        Self {
            extract_dimensions: ExtractDimensions::default(),
        }
    }
}

impl CustomJobs {
    /// Runs each job in the config, returning the number of non-skipped jobs
    fn run_jobs<'input, 'arena>(
        &self,
        element: &Element<'input, 'arena>,
        info: &Info<'input, 'arena>,
    ) -> Result<usize, JobsError<'input>> {
        let mut count = 0;
        log::debug!("💼 starting extract_dimensions");
        match self.extract_dimensions.start_with_info(element, info, None) {
            Err(e) if e.is_important() => return Err(e),
            Err(e) => log::error!("extract_dimensions failed {e}"),
            Ok(r) => {
                if !r.contains(PrepareOutcome::skip) {
                    count += 1;
                }
            }
        }
        Ok(count)
    }

    /// # Errors
    /// When any job fails for the first time
    pub fn run<'input, 'arena>(
        &self,
        root: Ref<'input, 'arena>,
        info: &Info<'input, 'arena>,
    ) -> Result<(), JobsError<'input>> {
        let Some(root_element) = Element::from_parent(root) else {
            log::warn!("No elements found in the document, skipping");
            return Ok(());
        };

        let count = self.run_jobs(&root_element, info)?;
        log::debug!("completed {count} jobs");
        Ok(())
    }
}
