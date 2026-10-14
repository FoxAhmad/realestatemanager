const express = require('express');
const { auth, superAdminOnly } = require('../middleware/auth');
const catalog = require('../services/catalogService');
const handle = require('./handle');

// Plan / feature / limit / addon catalog. Super admin only: tenants never edit what a plan contains.
const guard = [auth, superAdminOnly];
const id = (req) => Number(req.params.id);

const plans = express.Router();
plans.get('/', ...guard, handle(() => catalog.listPlans()));
plans.post('/', ...guard, handle((req) => catalog.createPlan(req.body), 201));
plans.put('/:id', ...guard, handle((req) => catalog.updatePlan(id(req), req.body)));
plans.put('/:id/prices', ...guard, handle((req) => catalog.setPrices(id(req), req.body.prices)));
plans.put('/:id/features', ...guard, handle((req) => catalog.setFeatures(id(req), req.body.features)));
plans.put('/:id/limits', ...guard, handle((req) => catalog.setLimits(id(req), req.body.limits)));
plans.post('/:id/clone', ...guard, handle((req) => catalog.clonePlan(id(req), req.body), 201));

const features = express.Router();
features.get('/', ...guard, handle(() => catalog.listFeatures()));
features.post('/', ...guard, handle((req) => catalog.createFeature(req.body), 201));
features.post('/limits', ...guard, handle((req) => catalog.createLimitDef(req.body), 201));
features.put('/:id', ...guard, handle((req) => catalog.updateFeature(id(req), req.body)));

const addons = express.Router();
addons.get('/', ...guard, handle(() => catalog.listAddons()));
addons.post('/', ...guard, handle((req) => catalog.createAddon(req.body), 201));
addons.put('/:id', ...guard, handle((req) => catalog.updateAddon(id(req), req.body)));

module.exports = { plans, features, addons };
