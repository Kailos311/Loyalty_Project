const express = require('express');
const user = require('./user');
const servicePackage = require('./servicePackage');
const warehouse = require('./warehouse');
const vendor = require('./vendor');
const driver = require('./driver');
const customerRepresentative = require('./customerRepresentative');

const router = express.Router();

router.use('/user', user);
router.use('/service-package', servicePackage);
router.use('/warehouse', warehouse);
router.use('/vendor', vendor);
router.use('/driver', driver);
router.use('/customer-representative', customerRepresentative);

module.exports = router;
