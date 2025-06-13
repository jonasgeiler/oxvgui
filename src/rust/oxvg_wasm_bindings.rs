//! WebAssembly bindings for OXVG based on
//! https://github.com/noahbald/oxvg/blob/d8fc238617d043969dc2af4395c8a53298e65c42/packages/wasm/src/lib.rs,
//! but customized for OXVGUI (returns SVG dimensions and allows prettifying).

extern crate console_error_panic_hook;
#[macro_use]
extern crate lazy_static;

mod extract_dimensions;
mod custom_jobs;

use oxvg_ast::{
    implementations::{roxmltree::parse, shared::Element},
    serialize::{self, Node as _, Options},
    visitor::Info,
};
use oxvg_optimiser::Jobs;
use serde::{Deserialize, Serialize};
use tsify::Tsify;
use wasm_bindgen::prelude::*;

use crate::custom_jobs::CustomJobs;
use crate::extract_dimensions::Dimensions;

#[derive(Tsify, Deserialize, Serialize, Clone, Debug)]
#[tsify(from_wasm_abi, into_wasm_abi)]
/// Result of the optimisation
pub struct OptimiseResult {
    /// Optimised SVG document
    pub data: String,
    /// Dimensions of the SVG document
    pub dimensions: Dimensions,
}

#[wasm_bindgen]
/// Optimise an SVG document using the provided config
///
/// # Errors
/// - If the document fails to parse
/// - If any of the optimisations fail
/// - If the optimised document fails to serialize
///
/// # Examples
///
/// Optimise svg with the default configuration
///
/// ```js
/// import { optimise } from "@oxvg/wasm";
///
/// const result = optimise(`<svg />`);
/// ```
///
/// Or, provide your own config
///
/// ```js
/// import { optimise } from "@oxvg/wasm";
///
/// // Only optimise path data
/// const result = optimise(`<svg />`, { convertPathData: {} });
/// ```
///
/// Or, extend a preset
///
/// ```js
/// import { optimise, extend } from "@oxvg/wasm";
///
/// const result = optimise(
///     `<svg />`,
///     extend("default", { convertPathData: { removeUseless: false } }),
/// );
/// ```
///
/// Prettify the output with the default config:
///
/// ```js
/// import { optimise } from "@oxvg/wasm";
///
/// const result = optimise(`<svg />`, undefined, true);
/// ```
pub fn optimise(svg: &str, config: Option<Jobs>, prettify: Option<bool>) -> Result<OptimiseResult, String> {
    console_error_panic_hook::set_once();

    let arena = typed_arena::Arena::new();
    let dom = parse(svg, &arena).map_err(|e| e.to_string())?;
    config
        .unwrap_or_default()
        .run(&dom, &Info::<Element>::new(&arena))
        .map_err(|err| err.to_string())?;

    let custom_jobs = CustomJobs::default();
    custom_jobs
    .run(&dom, &Info::<Element>::new(&arena))
    .map_err(|err| err.to_string())?;

    let data = dom.serialize_with_options(Options {
        indent: if prettify.unwrap_or(false) {
            serialize::Indent::Spaces(2)
        } else {
            serialize::Indent::None
        },
        ..Default::default()
    })
    .map_err(|err| err.to_string())?;

    Ok(OptimiseResult {
        data,
        dimensions: custom_jobs.extract_dimensions.0.into_inner(),
    })
}

//////////////////////////////////////////////////////////////////////////////////////
// NOTE: Cut out `convert_svgo_config` since I don't need it and there was an error //
//////////////////////////////////////////////////////////////////////////////////////

//////////////////////////////////////////////////
// NOTE: Cut out `extend` since I don't need it //
//////////////////////////////////////////////////

#[wasm_bindgen(js_name = getDimensions)]
/// Returns the dimensions of the SVG document.
/// Basically does the same as `optimise`, but doesn't run any optimisations.
pub fn get_dimensions(svg: &str) -> Result<Dimensions, String> {
    console_error_panic_hook::set_once();

    let arena = typed_arena::Arena::new();
    let dom = parse(svg, &arena).map_err(|e| e.to_string())?;

    let custom_jobs = CustomJobs::default();
    custom_jobs
        .run(&dom, &Info::<Element>::new(&arena))
        .map_err(|err| err.to_string())?;

    Ok(custom_jobs.extract_dimensions.0.into_inner())
}
