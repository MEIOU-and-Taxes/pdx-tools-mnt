//! Saved loan contracts. Rates are annual fractions (0.05 = 5%).
use eu5save::models::Gamestate;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
pub struct DebtLoan {
    pub principal: f64,
    pub annual_rate: Option<f64>,
    pub lender_id: u32,
    pub lender_tag: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
pub struct CountryDebt {
    pub country_id: u32,
    pub tag: String,
    pub flag: Option<String>,
    pub wealth: Option<f64>,
    pub debt: f64,
    pub interest_weighted_principal: f64,
    pub rated_principal: f64,
    /// Full new-loan quote is not recoverable from the current parser model.
    pub new_loan_rate: Option<f64>,
    pub loans: Vec<DebtLoan>,
}

pub fn extract(game: &Gamestate<'_>) -> Vec<CountryDebt> {
    let mut wealth = BTreeMap::<u32, f64>::new();
    for entry in game.locations.iter() {
        let location = entry.location();
        if !location.owner.is_dummy() && location.possible_tax.is_finite() {
            *wealth.entry(location.owner.value()).or_default() += location.possible_tax;
        }
    }
    let mut countries = BTreeMap::new();
    // Retain debt-free countries in the economic denominator and country table.
    for (&id, &value) in &wealth {
        if let Some(entry) = game
            .countries
            .get_entry(eu5save::models::CountryId::new(id))
        {
            countries.insert(
                id,
                CountryDebt {
                    country_id: id,
                    tag: entry.tag().to_str().to_owned(),
                    flag: entry
                        .data()
                        .and_then(|d| d.flag)
                        .map(|f| f.to_str().to_owned()),
                    wealth: Some(value),
                    debt: 0.0,
                    interest_weighted_principal: 0.0,
                    rated_principal: 0.0,
                    new_loan_rate: None,
                    loans: Vec::new(),
                },
            );
        }
    }
    for loan in game.loan_manager.database.iter() {
        if loan.borrower.is_dummy() || !loan.amount.is_finite() || loan.amount <= 0.0 {
            continue;
        }
        let Some(borrower) = game.countries.get_entry(loan.borrower) else {
            continue;
        };
        let country = countries
            .entry(loan.borrower.value())
            .or_insert_with(|| CountryDebt {
                country_id: loan.borrower.value(),
                tag: borrower.tag().to_str().to_owned(),
                flag: borrower
                    .data()
                    .and_then(|d| d.flag)
                    .map(|f| f.to_str().to_owned()),
                wealth: None,
                debt: 0.0,
                interest_weighted_principal: 0.0,
                rated_principal: 0.0,
                new_loan_rate: None,
                loans: Vec::new(),
            });
        let rate = loan.interest.is_finite().then_some(loan.interest);
        country.debt += loan.amount;
        if let Some(rate) = rate {
            country.rated_principal += loan.amount;
            country.interest_weighted_principal += loan.amount * rate;
        }
        country.loans.push(DebtLoan {
            principal: loan.amount,
            annual_rate: rate,
            lender_id: loan.lender.value(),
            lender_tag: (!loan.lender.is_dummy())
                .then(|| {
                    game.countries
                        .get_entry(loan.lender)
                        .map(|e| e.tag().to_str().to_owned())
                })
                .flatten(),
        });
    }
    countries.into_values().collect()
}
