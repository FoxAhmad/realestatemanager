const express = require('express');
const router = express.Router();
const { auth, superAdminOnly } = require('../middleware/auth');
const tenantService = require('../services/tenantService');

// Platform administration (super_admin only): create tenants, change plan/status.
const handle = (fn, status = 200) => async (req, res) => {
  try {
    res.status(status).json(await fn(req));
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    console.error(error);
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Server error', error: error.message, code: error.code });
  }
};

router.get('/', auth, superAdminOnly, handle(() => tenantService.listTenants()));
router.post('/', auth, superAdminOnly, handle((req) => tenantService.createTenant(req.body, req.user.id), 201));
router.put('/:id', auth, superAdminOnly, handle((req) =>
  tenantService.updateTenant(Number(req.params.id), { plan: req.body.plan, status: req.body.status }, req.user.id)));

module.exports = router;
