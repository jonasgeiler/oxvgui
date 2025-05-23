//! WebAssembly bindings for OXVG based on
//! https://github.com/noahbald/oxvg/blob/d8fc238617d043969dc2af4395c8a53298e65c42/packages/wasm/src/lib.rs,
//! but customized for OXVGUI (returns SVG dimensions).

#[macro_use]
extern crate lazy_static;

extern crate console_error_panic_hook;

mod extract_dimensions;
mod custom_jobs;

use oxvg_ast::{
    implementations::{roxmltree::parse, shared::Element},
    serialize::{self, Node as _, Options},
    visitor::Info,
};
use oxvg_optimiser::{Extends, Jobs};
use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use tsify::Tsify;

use crate::custom_jobs::CustomJobs;

#[derive(Tsify, Deserialize, Serialize, Clone, Debug)]
#[tsify(from_wasm_abi, into_wasm_abi)]
pub struct Dimensions {
    // TODO: Make width/height Option<f64>
    pub width: f64,
    pub height: f64,
}

#[derive(Tsify, Deserialize, Serialize, Clone, Debug)]
#[tsify(from_wasm_abi, into_wasm_abi)]
pub struct OptimiseResult {
    pub data: String,
    pub dimensions: Option<Dimensions>,
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
pub fn optimise(svg: &str, config: Option<Jobs>) -> Result<OptimiseResult, String> {
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
        indent: serialize::Indent::None,
        ..Default::default()
    })
    .map_err(|err| err.to_string())?;

    Ok(OptimiseResult {
        data,
        dimensions: custom_jobs.extract_dimensions.0.into_inner().map(|(width, height)| Dimensions { width, height }),
    })
}

////////////////////////////////////////////////////////////////////////////////////
// NOTE: Cut out convert_svgo_config since I don't need it and there was an error //
////////////////////////////////////////////////////////////////////////////////////

#[wasm_bindgen]
#[allow(clippy::needless_pass_by_value)]
/// Returns the given config with omitted options replaced with the config provided by `extends`.
/// I.e. acts like `{ ...extends, ...config }`
pub fn extend(extends: &Extends, config: Option<Jobs>) -> Jobs {
    match config {
        Some(ref jobs) => extends.extend(jobs),
        None => extends.jobs(),
    }
}

#[wasm_bindgen(js_name = getDimensions)]
/// Returns the dimensions of the SVG document.
/// Basically does the same as `optimise`, but doesn't run any optimisations.
pub fn get_dimensions(svg: &str) -> Result<Option<Dimensions>, String> {
    console_error_panic_hook::set_once();

    let arena = typed_arena::Arena::new();
    let dom = parse(svg, &arena).map_err(|e| e.to_string())?;

    let custom_jobs = CustomJobs::default();
    custom_jobs
        .run(&dom, &Info::<Element>::new(&arena))
        .map_err(|err| err.to_string())?;

    Ok(custom_jobs.extract_dimensions.0.into_inner().map(|(width, height)| Dimensions { width, height }))
}
