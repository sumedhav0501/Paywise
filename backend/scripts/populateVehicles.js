// /backend/scripts/populateVehicles.js
const { index } = require('../utils/meilisearchClient');
const axios = require('axios');
require('dotenv').config();

const BACKEND_URL = process.env.BACKEND_HOST || 'http://backend:3001';
const YEARS = ['2024', '2025']; // Add more years as needed

async function fetchMakes() {
  const res = await axios.get(`${BACKEND_URL}/api/makes`);
  return res.data || [];
}

async function fetchModels(make) {
  const res = await axios.post(`${BACKEND_URL}/api/models`, { make });
  return res.data || [];
}

async function fetchVehiclesForCombo(brand, model, yearGroup) {
  try {
    const res = await axios.post(`${BACKEND_URL}/api/get-vehicle-data`, {
      brand,
      model,
      yearGroup,
    });
    return res.data || [];
  } catch (e) {
    console.warn(`⚠️ Failed for ${brand} ${model} ${yearGroup}`);
    return [];
  }
}
const getLeasePrice = async (vehicle) => {
  const payload = {
    calculationPeriods: ["Weekly", "Monthly", "Fortnightly"],
    vehicle: {
      ...vehicle,
      make: vehicle.make,
      model: vehicle.model,
      yearGroup: vehicle.yearGroup,
      vehicleID: vehicle.vehicleID || vehicle.id || Math.random().toString(),
      listPrice: vehicle.listPrice || 85000,
    },
    financier: {
      id: 14,
      name: "Angle Auto Finance Pty Ltd",
      interestRate: 0.0954,
      residualCostMethod: "DepreciableValue",
      financierEntity: "Angle",
      originatorFeeMaximum: 1100,
    },
    originatorFee: 1100,
    purchasePrice: vehicle.listPrice || 85000,
    salePrice: vehicle.listPrice || 85000,
    state: "NSW",
    annualKms: 5000,
    leaseTerm: 12,
    annualSalary: 20000,
    hasHECS: false,
    calculationDate: new Date().toISOString(),
    totalOptionsSale: 0,
    totalOptionsPrice: 0,
    isNewVehicle: true,
    membershipFee: 0,
    managementFee: 468,
    startingOdometer: 0,
    budgetOverrides: {},
    commissionPercentage: 0.1,
    deferredPeriods: 2,
    fbtExemption: false,
    managementType: "InternallyManaged",
    bureau: "Internal",
    insurance: {
      age: 35,
      provider: "Paywise",
      insuranceRate: {
        insuranceType: "Standard1",
        leaseInsuranceRate: {},
        isEligible: "Yes",
        errorMessage: "",
      },
    },
    includeGAP: true,
    includeRoadSide: false,
    includeLuxuryCarCharge: true,
  };

  try {
    const res = await axios.post(`${BACKEND_URL}/api/get-lease-data`, payload);
    const leaseData = res.data;
    const prices = {};
    for (const period of ["Weekly", "Monthly", "Fortnightly"]) {
      const item = leaseData.periodicCalculations.find(p => p.period === period);
      if (item?.cost?.budget?.budgetTotal != null) {
        prices[period.toLowerCase()] = item.cost.budget.budgetTotal;
      }
    }
    return prices;
  } catch (err) {
    console.warn("⚠️ Lease price fetch failed for:", vehicle, err.message);
    return {};
  }
};

async function main() {
  const makes = await fetchMakes();
  const allVehicles = [];

  for (const brand of makes) {
    const models = await fetchModels(brand);
    for (const model of models) {
      for (const yearGroup of YEARS) {
        const vehicles = await fetchVehiclesForCombo(brand, model, yearGroup);

        for (const v of vehicles) {
          const leasePrices = await getLeasePrice(v);
          allVehicles.push({
            id: v.vehicleID || v.id || Math.random().toString(), // required by Meilisearch
            fullName: `${v.yearGroup} ${v.make} ${v.model} ${v.variant || ''}`,
            brand: v.make,
            model: v.model,
            year: v.yearGroup,
            variant: v.variant || '',
            fuelType: v.fuelType || null,
            engineType: v.engineTypeDescription || null,
            powerPlant: v.powerPlantType || null,
            body: v.bodyStyle || null,
            imageUrl: v.imageCode || null,
            price: v.price || v.listPrice || null,
            transmission: v.transmission || v.gearTypeDescription || null,
            tags: [v.make, v.model, v.variant].filter(Boolean),

            // ✅ Keep full raw API response
            raw: v,
            leasePrices,
          });

        }
      }
    }
  }

  console.log(`📦 Indexing ${allVehicles.length} vehicles to Meilisearch`);
  await index.addDocuments(allVehicles);
  console.log('✅ Done.');
}

main().catch((e) => {
  console.error('❌ Indexing failed:', e.message);
});
