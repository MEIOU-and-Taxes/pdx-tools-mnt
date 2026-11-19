use crate::analysis::Eu5Analysis;
use crate::snapshot::{CountryObservation, SaveSnapshot};
use campaign_analysis::View;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Default, Clone, PartialEq)]
pub(crate) struct SavedInsights {
    pub history: Vec<u8>,
    pub overviews: Vec<u8>,
    pub country_ids: Vec<u32>,
}
campaign_analysis::columns!(SavedInsights {
    history,
    overviews,
    country_ids
});

#[derive(Serialize, Deserialize)]
pub(crate) struct HistoryData {
    pub snapshot: SaveSnapshot,
    pub world: Option<CountryObservation>,
}

impl HistoryData {
    pub(crate) fn new(snapshot: SaveSnapshot) -> Self {
        let world = world(&snapshot.countries);
        Self { snapshot, world }
    }
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
pub struct HistorySnapshot {
    pub id: String,
    pub snapshot: SaveSnapshot,
}

pub fn history(
    view: &View<'_, Eu5Analysis>,
    country: Option<u32>,
    good: Option<String>,
    centers: Vec<u32>,
    full: bool,
) -> Vec<HistorySnapshot> {
    let centers: BTreeSet<_> = centers.into_iter().collect();
    view.snapshots()
        .iter()
        .filter_map(|row| {
            let HistoryData {
                mut snapshot,
                world,
            } = postcard::from_bytes(&row.payload().mnt.history).ok()?;
            if !full {
                if let Some(id) = country {
                    snapshot.countries.retain(|row| row.country_id == id);
                } else {
                    snapshot.countries = world.into_iter().collect();
                }
                snapshot.markets.retain(|market| {
                    good.as_ref() == Some(&market.good)
                        && (centers.is_empty() || centers.contains(&market.center))
                });
            }
            Some(HistorySnapshot {
                id: row.descriptor().id.clone(),
                snapshot,
            })
        })
        .collect()
}

fn world(countries: &[CountryObservation]) -> Option<CountryObservation> {
    if countries.is_empty() {
        return None;
    }
    let mut total = CountryObservation {
        country_id: u32::MAX,
        tag: String::from("world"),
        ..Default::default()
    };
    for country in countries {
        total.population += country.population;
        total.development += country.development;
        total.locations += country.locations;
        total.wealth += country.wealth;
        total.tax += country.tax;
        total.effective_development += country.effective_development;
        total.state_capacity += country.state_capacity;
        total.births += country.births;
        total.rural_population += country.rural_population;
        total.urban_population += country.urban_population;
        total.rgo_levels += country.rgo_levels;
        total.building_levels += country.building_levels;
        total.building_employment += country.building_employment;
        total.income += country.income;
        for (source, target) in [
            (&country.religions, &mut total.religions),
            (&country.materials, &mut total.materials),
            (&country.buildings, &mut total.buildings),
        ] {
            for (key, value) in source {
                *target.entry(key.clone()).or_default() += value;
            }
        }
    }
    Some(total)
}

pub fn market_centers(view: &View<'_, Eu5Analysis>, country: u32) -> Vec<u32> {
    let mut centers = BTreeSet::new();
    for row in view.snapshots() {
        let Ok(saved) = postcard::from_bytes::<HistoryData>(&row.payload().mnt.history) else {
            continue;
        };
        if let Some(country) = saved
            .snapshot
            .countries
            .iter()
            .find(|row| row.country_id == country)
        {
            centers.extend(&country.market_centers);
        }
    }
    centers.into_iter().collect()
}

pub fn overview(view: &View<'_, Eu5Analysis>, key: String) -> Option<String> {
    let row = view.snapshots().first()?;
    let overviews: BTreeMap<&str, &[u8]> =
        postcard::from_bytes(&row.payload().mnt.overviews).ok()?;
    let data = pdx_zstd::decode_all(overviews.get(key.as_str())?).ok()?;
    String::from_utf8(data).ok()
}

pub fn country_at_index(view: &View<'_, Eu5Analysis>, index: u32) -> Option<u32> {
    let row = view.snapshots().first()?;
    row.payload().mnt.country_ids.get(index as usize).copied()
}

pub fn location_at_index(view: &View<'_, Eu5Analysis>, index: u32) -> Option<u32> {
    let row = view.snapshots().first()?;
    row.payload()
        .locations
        .keys()
        .get(index as usize)
        .map(|id| id.value())
}
