use std::cell::RefCell;
use oxvg_ast::{
    element::Element as ElementTrait,
    visitor::{Context, Visitor}
};
use serde::{Deserialize, Serialize};
use tsify::Tsify;

#[derive(Tsify, Deserialize, Serialize, Clone, Debug)]
#[tsify(from_wasm_abi, into_wasm_abi)]
/// Dimensions of the SVG document
pub struct Dimensions {
    /// Width of the SVG document
    pub width: Option<f64>,
    /// Height of the SVG document
    pub height: Option<f64>,
}

#[derive(Tsify, Deserialize, Serialize, Debug, Clone)]
#[serde(transparent)]
/// Extracts the SVG's width and height from the `width`/`height` or `viewBox` attribute on `<svg>`.
/// Based on:
/// - https://github.com/noahbald/oxvg/blob/d8fc238617d043969dc2af4395c8a53298e65c42/crates/oxvg_optimiser/src/jobs/remove_view_box.rs
/// - https://github.com/noahbald/oxvg/blob/d8fc238617d043969dc2af4395c8a53298e65c42/crates/oxvg_optimiser/src/jobs/remove_dimensions.rs
pub struct ExtractDimensions(pub RefCell<Dimensions>);

impl<'arena, E: ElementTrait<'arena>> Visitor<'arena, E> for ExtractDimensions {
    type Error = String;

    fn element(
        &self,
        element: &mut E,
        _context: &mut Context<'arena, '_, '_, E>,
    ) -> Result<(), Self::Error> {
        // TODO: Traverse the tree and find the root <svg> element, then extract the width and height from the attributes.
        //       See: https://github.com/noahbald/oxvg/blob/d8fc238617d043969dc2af4395c8a53298e65c42/crates/oxvg_optimiser/src/jobs/remove_view_box.rs
        //       See: https://github.com/noahbald/oxvg/blob/d8fc238617d043969dc2af4395c8a53298e65c42/crates/oxvg_optimiser/src/jobs/remove_dimensions.rs

        // Already extracted
        let dimensions = self.0.borrow();
        if dimensions.width.is_some() && dimensions.height.is_some() {
            return Ok(());
        }
        drop(dimensions);

        // TODO: Check if root
        if element.prefix().is_some() || element.local_name().as_ref() != "svg" {
            return Ok(());
        }

        // TODO: Check if units are supported in SVGs and parse them
        if let (Some(width_attr), Some(height_attr)) = (
            element.get_attribute_local(&"width".into()),
            element.get_attribute_local(&"height".into()),
        ) {
            if let (Ok(width), Ok(height)) = (
                width_attr.as_ref().parse::<f64>(),
                height_attr.as_ref().parse::<f64>(),
            ) {
                *self.0.borrow_mut() = Dimensions {
                    width: Some(width),
                    height: Some(height),
                };
                return Ok(());
            }
        }

        // TODO: Check if units are supported in SVGs and parse them
        if let Some(view_box_attr) = element.get_attribute_local(&"viewBox".into()) {
            let mut nums = Vec::with_capacity(4);
            nums.extend(SEPARATOR.split(view_box_attr.as_ref()));
            if nums.len() == 4 {
                if let (Ok(width), Ok(height)) = (
                    nums[2].parse::<f64>(),
                    nums[3].parse::<f64>(),
                ) {
                    *self.0.borrow_mut() = Dimensions {
                        width: Some(width),
                        height: Some(height),
                    };
                    return Ok(());
                }
            }
        };

        Ok(())
    }
}

impl Default for ExtractDimensions {
    fn default() -> Self {
        Self(RefCell::new(Dimensions {
            width: None,
            height: None,
        }))
    }
}

lazy_static! {
    pub static ref SEPARATOR: regex::Regex = regex::Regex::new(r"[ ,]+").unwrap();
}
