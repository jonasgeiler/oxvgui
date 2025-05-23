use std::cell::RefCell;
use oxvg_ast::{
    element::Element as ElementTrait,
    visitor::{Context, Visitor}
};
use serde::{Deserialize, Serialize};
use tsify::Tsify;

#[derive(Tsify, Deserialize, Serialize, Debug, Clone)]
#[serde(transparent)]
/// Extracts the SVG's width and height from the `width`/`height` or `viewBox` attribute on `<svg>`.
/// Based on:
/// - https://github.com/noahbald/oxvg/blob/d8fc238617d043969dc2af4395c8a53298e65c42/crates/oxvg_optimiser/src/jobs/remove_view_box.rs
/// - https://github.com/noahbald/oxvg/blob/d8fc238617d043969dc2af4395c8a53298e65c42/crates/oxvg_optimiser/src/jobs/remove_dimensions.rs
pub struct ExtractDimensions(pub RefCell<Option<(f64, f64)>>);

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
        if self.0.borrow().is_some() {
            return Ok(());
        }

        // TODO: Check if root
        if element.prefix().is_some() || element.local_name().as_ref() != "svg" {
            return Ok(());
        }

        if let (Some(width_attr), Some(height_attr)) = (
            element.get_attribute_local(&"width".into()),
            element.get_attribute_local(&"height".into()),
        ) {
            if let (Ok(width), Ok(height)) = (
                width_attr.as_ref().parse::<f64>(),
                height_attr.as_ref().parse::<f64>(),
            ) {
                *self.0.borrow_mut() = Some((width, height));
                return Ok(());
            }
        }

        if let Some(view_box_attr) = element.get_attribute_local(&"viewBox".into()) {
            let mut nums = Vec::with_capacity(4);
            nums.extend(SEPARATOR.split(view_box_attr.as_ref()));
            if nums.len() == 4 {
                if let (Ok(width), Ok(height)) = (
                    nums[2].parse::<f64>(),
                    nums[3].parse::<f64>(),
                ) {
                    *self.0.borrow_mut() = Some((width, height));
                    return Ok(());
                }
            }
        };

        Ok(())
    }
}

impl Default for ExtractDimensions {
    fn default() -> Self {
        Self(RefCell::new(None))
    }
}

lazy_static! {
    pub static ref SEPARATOR: regex::Regex = regex::Regex::new(r"[ ,]+").unwrap();
}
