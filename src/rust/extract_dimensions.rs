use lightningcss::values::percentage::DimensionPercentage;
use oxvg_ast::{
    element::Element,
    get_attribute, is_element, node,
    visitor::{Context, Visitor},
};
use oxvg_collections::attribute::presentation::LengthPercentage;
use oxvg_optimiser::error::JobsError;
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use tsify::Tsify;

// Based on:
// - https://github.com/noahbald/oxvg/blob/e156479dd9d4634542fa9849a45253e089c8d150/crates/oxvg_optimiser/src/jobs/remove_view_box.rs
// - https://github.com/noahbald/oxvg/blob/e156479dd9d4634542fa9849a45253e089c8d150/crates/oxvg_optimiser/src/jobs/remove_dimensions.rs

#[derive(Tsify, Deserialize, Serialize, Clone, Debug)]
#[tsify(from_wasm_abi, into_wasm_abi)]
/// Dimensions of the SVG document
pub struct Dimensions {
    /// Width of the SVG document
    pub width: Option<f32>,
    /// Height of the SVG document
    pub height: Option<f32>,
}

#[derive(Tsify, Deserialize, Serialize, Debug, Clone)]
#[serde(transparent)]
/// Extracts the SVG's width and height from the `width`/`height` or `viewBox` attribute on `<svg>`.
pub struct ExtractDimensions(pub RefCell<Dimensions>);

impl Default for ExtractDimensions {
    fn default() -> Self {
        Self(RefCell::new(Dimensions {
            width: None,
            height: None,
        }))
    }
}

impl<'input, 'arena> Visitor<'input, 'arena> for ExtractDimensions {
    type Error = JobsError<'input>;

    fn element(
        &self,
        element: &Element<'input, 'arena>,
        _context: &mut Context<'input, 'arena, '_>,
    ) -> Result<(), Self::Error> {
        // Return if already extracted
        let dimensions = self.0.borrow();
        if dimensions.width.is_some() && dimensions.height.is_some() {
            return Ok(());
        }
        drop(dimensions);

        // Make sure it's the root <svg> element
        if !is_element!(element, Svg)
            || !element
                .parent_node()
                .is_some_and(|n| n.node_type() == node::Type::Document)
        {
            return Ok(());
        }

        // Use width/height attributes if present and valid
        let width_attr = get_attribute!(element, WidthSvg);
        let height_attr = get_attribute!(element, HeightSvg);
        if let (
            Some(LengthPercentage(DimensionPercentage::Dimension(width))),
            Some(LengthPercentage(DimensionPercentage::Dimension(height))),
        ) = (width_attr.as_deref(), height_attr.as_deref())
        {
            if let (Some(width), Some(height)) = (width.to_px(), height.to_px()) {
                *self.0.borrow_mut() = Dimensions {
                    width: Some(width),
                    height: Some(height),
                };
                return Ok(());
            }
        }
        drop((width_attr, height_attr));

        // Use viewBox attribute if present and valid, as fallback to the above
        if let Some(view_box) = get_attribute!(element, ViewBox) {
            *self.0.borrow_mut() = Dimensions {
                width: Some(view_box.width),
                height: Some(view_box.height),
            };
            return Ok(());
        };

        Ok(())
    }
}
