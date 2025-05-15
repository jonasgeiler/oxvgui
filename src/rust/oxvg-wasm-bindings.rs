//! WebAssembly bindings for OXVG based on
//! https://github.com/noahbald/oxvg/blob/d8fc238617d043969dc2af4395c8a53298e65c42/packages/wasm/src/lib.rs,
//! but customized for OXVGUI (returns SVG dimensions).
extern crate console_error_panic_hook;
use oxvg_ast::{
  element::Element as ElementTrait,
  implementations::{roxmltree::parse, shared::Element},
  serialize::{self, Node as _, Options},
  visitor::{Context, ContextFlags, Info, PrepareOutcome, Visitor}
};
use oxvg_optimiser::{Extends, Jobs};
use tsify::Tsify;
use wasm_bindgen::prelude::*;

#[derive(Tsify, Debug, Clone, Default)]
/// Extracts the SVG's width and height from the `width`/`height` or `viewBox` attribute on `<svg>`.
pub struct ExtractDimensions(pub bool);

impl<'arena, E: ElementTrait<'arena>> Visitor<'arena, E> for ExtractDimensions {
  type Error = String;

  fn prepare(
    &self,
    _document: &E,
    _info: &Info<'arena, E>,
    _context_flags: &mut ContextFlags,
  ) -> Result<PrepareOutcome, Self::Error> {
    Ok(if self.0 {
      PrepareOutcome::none
    } else {
      PrepareOutcome::skip
    })
  }

  fn element(
    &self,
    element: &mut E,
    _context: &mut Context<'arena, '_, '_, E>,
  ) -> Result<(), Self::Error> {
    // TODO: Traverse the tree and find the root <svg> element, then extract the width and height from the attributes.
    //       See: https://github.com/noahbald/oxvg/blob/d8fc238617d043969dc2af4395c8a53298e65c42/crates/oxvg_optimiser/src/jobs/remove_view_box.rs
    //       See: https://github.com/noahbald/oxvg/blob/d8fc238617d043969dc2af4395c8a53298e65c42/crates/oxvg_optimiser/src/jobs/remove_dimensions.rs

    Ok(())
  }
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
pub fn optimise(svg: &str, config: Option<Jobs>) -> Result<String, String> {
  console_error_panic_hook::set_once();

  let arena = typed_arena::Arena::new();
  let dom = parse(svg, &arena).map_err(|e| e.to_string())?;
  config
    .unwrap_or_default()
    .run(&dom, &Info::<Element>::new(&arena))
    .map_err(|err| err.to_string())?;

  dom.serialize_with_options(Options {
    indent: serialize::Indent::None,
    ..Default::default()
  })
    .map_err(|err| err.to_string())
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
