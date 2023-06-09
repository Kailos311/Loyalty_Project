const express = require('express');
const user = require('./user');
const customer = require('./customer');
const shipment = require('./shipment');
const inventory = require('./inventory');
const admin = require('./admin');

const router = express.Router();

router.get('/health', (req, res) => {
  res.send('OK Cool!');
});

router.use('/user', user);
router.use('/customer', customer);
router.use('/shipment', shipment);
router.use('/inventory', inventory);
router.use('/admin', admin);

module.exports = router;
