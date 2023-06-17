/* eslint-disable prettier/prettier */
const mongoose = require('mongoose');
const api = require('../config/api');
const system_settings = require('../config/system_settings');
const AWS = require('aws-sdk');
const twilioClient = require('twilio')(api.TWILIO.TWILIO_ACCOUNT_SID, api.TWILIO.TWILIO_AUTH_TOKEN);

const ses = new AWS.SES({
  accessKeyId: api.AWS.AWS_ACCESS_KEY,
  secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  region: api.AWS.AWS_SES_REGION,
  apiVersion: '2010-12-01',
});
const sns = new AWS.SNS({
  apiVersion: '2010-03-31',
  accessKeyId: api.AWS.AWS_ACCESS_KEY,
  secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  region: api.AWS.AWS_SNS_REGION,
});

const path = require('path');
const Phaxio = require('phaxio');
const mailcomposer = require('mailcomposer');

const { FILES_PATH } = require('../config/path');
const Shipment = require('../models/shipment');
const Customer = require('../models/customer');
const Inventory = require('../models/inventory');

const phaxio = new Phaxio(
  api.PHAXIO.PHAXIO_API_KEY,
  api.PHAXIO.PHAXIO_API_SECRET
);

const get = async (req, res) => {
  const { currentUser } = req;
  const shipment = await Shipment.findOne({
    // user: currentUser.id,
    _id: req.params.id,
  });

  if (!shipment) {
    return res.status(400).json({
      status: false,
      error: 'Shipment doesn`t exist',
    });
  }

  return res.send({
    status: true,
    shipment,
  });
};

// get also customer info, for Shipment Detail page, etc
const getAlsoRelated = async (req, res) => {
  const { currentUser } = req;
  const query = [];

  query.push({
    $match: {
      // user: mongoose.Types.ObjectId(currentUser.id),
      _id: mongoose.Types.ObjectId(req.params.id),
    },
  });

  query.push({
    $lookup: {
      from: 'customers',
      localField: 'customer',
      foreignField: '_id',
      as: 'customer',
    },
  });

  query.push({
    $addFields: {
      totalCustomers: { $size: '$customer' },
      id: '$_id',
    },
  });

  query.push({
    $lookup: {
      from: 'drivers',
      localField: 'driver',
      foreignField: '_id',
      as: 'driver',
    },
  });

  query.push({
    $lookup: {
      from: 'customerrepresentatives',
      localField: 'customerRepresentative',
      foreignField: '_id',
      as: 'customerRepresentative',
    },
  });

  const shipments = await Shipment.aggregate(query).exec();

  return res.send({ shipments });
};

const create = async (req, res) => {
  const { currentUser } = req;
  const { customer } = req.body;

  const data = {
    ...req.body,
  };

  if (req.body.driver) {
    if (req.body.driver === '') {
      data.driver = undefined;
    } else {
      data.driver = mongoose.Types.ObjectId(req.body.driver);
    }
  } else {
    data.driver = undefined;
  }

  if (req.body.customerRepresentative) {
    if (req.body.customerRepresentative === '') {
      data.customerRepresentative = undefined;
    } else {
      data.customerRepresentative = mongoose.Types.ObjectId(req.body.customerRepresentative);
    }
  } else {
    data.customerRepresentative = undefined;
  }

  const shipment = new Shipment({
    ...data,
    user: currentUser.id,
    customer,
  });

  try {
    const result = await shipment.save();
  } catch (err) {
    console.log('Shipment save err', err.message);
    return res.send({
      status: false,
    });
  }

  // Process inventories from Packing List
  const inventories = data.packagesTableData;
  for (const inventory of inventories) {
    let isEmptyRow = true;
    for (const key in inventory) {
      // console.log(`${key}: ${inventory[key]}`);
      if (inventory[key] && inventory[key].length > 0) {
        isEmptyRow = false;
        break;
      }
    }

    if (isEmptyRow) continue;
    if (inventory.inventoryStr && inventory.inventoryStr.length > 0) {
      // from Packing List
      const arr = inventory.inventoryStr.split(',');
      let pieces = '';
      let idValue = '';
      let contentValue = '';
      if (arr.length >= 3) {
        [pieces, idValue, contentValue] = arr;
      }

      const tmp = inventory.warehouse;
      let idValue02 = '';
      let contentValue02 = '';
      if (tmp) {
        const arr = tmp.split('***');
        if (arr.length >= 2) {
          [idValue02, contentValue02] = arr;
        }
      }
      delete inventory.warehouse;

      const recordData = {
        ...inventory,
        user: currentUser.id,
        inventoryType: shipment.type === '1' ? 'shipment' : 'service',
        shipment: shipment._id,
        customer: data.customer,
        inventory: idValue,
        warehouse: idValue02 === '' ? null : idValue02,
      };

      console.log('>>> recordData', recordData);
      try {
        await Inventory.findOneAndUpdate(
          {
            inventoryType: shipment.type === '1' ? 'shipment' : 'service',
            shipment: shipment._id,
            customer: data.customer,
            inventory: idValue,
          },
          {
            $set: recordData,
          },
          {
            upsert: true,
          }
        );
      } catch(err) {
        console.log('>>> err', err);
        return res.send({
          status: false,
          error: 'inventory create error',
        });
      }
    }
  }

  // return Success
  res.send({
    status: true,
    shipment,
  });
};

const loadByQuery = async (req, res) => {
  const { currentUser } = req;
  const { searchText, status, customer_id, page, limit, type } = req.body;
  const { shipmentIdArr } = req.body;
  // console.log(">>> loadByQuery", searchText, status, customer_id, page, limit);
  // console.log(">>> loadByQuery(), shipmentIdArr", shipmentIdArr);
  const query = [];

  if (shipmentIdArr) {
    const shipmentIdObjArr = [];
    for (let i = 0; i < shipmentIdArr.length; i++) {
      shipmentIdObjArr.push(mongoose.Types.ObjectId(shipmentIdArr[i]));
    }
    query.push({
      $match: {
        "_id": {
          $in: shipmentIdObjArr
        }
      },
    });
  } else {
    if (searchText) {
      query.push({
        $match: {
          $or: [
            {
              title: { $regex: searchText + '.*', $options: 'i' },
            },
            {
              originFullAddr: { $regex: searchText + '.*', $options: 'i' },
            },
            {
              destFullAddr: { $regex: searchText + '.*', $options: 'i' },
            },
          ],
          // user: mongoose.Types.ObjectId(currentUser.id),
          status,
          type,
        },
      });
    } else {
      query.push({
        $match: {
          // user: mongoose.Types.ObjectId(currentUser.id),
          status,
          type,
        },
      });
    }
  
    if (customer_id !== '') {
      query.push({
        $match: {
          customer: mongoose.Types.ObjectId(customer_id),
        },
      });
    }
  }

  query.push({
    $lookup: {
      from: 'customers',
      localField: 'customer',
      foreignField: '_id',
      as: 'customer',
    },
  });

  query.push({
    $addFields: {
      totalCustomers: { $size: '$customer' },
      id: '$_id',
    },
  });

  query.push({
    $match: {
      totalCustomers: { $gt: 0 },
    },
  });

  query.push({
    $lookup: {
      from: 'drivers',
      localField: 'driver',
      foreignField: '_id',
      as: 'driver',
    },
  });

  query.push({
    $lookup: {
      from: 'customerRepresentatives',
      localField: 'customerRepresentative',
      foreignField: '_id',
      as: 'customerRepresentative',
    },
  });

  // get the total count
  query.push({
    $count: 'totalCount',
  });
  const response = await Shipment.aggregate(query).exec();

  let totalCount = 0;
  if (response.length > 0) {
    totalCount = response[0].totalCount;
  }
  query.pop();

  if (page !== undefined) {
    const skip = page * limit;
    if (skip > 0) {
      query.push({
        $skip: skip,
      });
    }
  
    query.push({
      $limit: limit,
    });  
  }

  // console.log('>>> loadByQuery: query', query.toString());
  const shipments = await Shipment.aggregate(query).exec();
  return res.send({
    status: true,
    shipments,
    totalCount,
  });
};

const update = async (req, res) => {
  const { currentUser } = req;

  const data = {
    ...req.body,
  };

  if (req.body.driver) {
    if (req.body.driver === '') {
      data.driver = undefined;
    } else {
      data.driver = mongoose.Types.ObjectId(req.body.driver);
    }
  } else {
    data.driver = undefined;
  }

  if (req.body.customerRepresentative) {
    if (req.body.customerRepresentative === '') {
      data.customerRepresentative = undefined;
    } else {
      data.customerRepresentative = mongoose.Types.ObjectId(req.body.customerRepresentative);
    }
  } else {
    data.customerRepresentative = undefined;
  }

  try {
    const result = await Shipment.updateOne(
      {
        _id: req.params.id,
        // user: currentUser.id,
      },
      {
        $set: data,
      }
    );
  } catch (err) {
    res.status(500).json({
      status: false,
      error: err.message || 'Shipment Update Error',
    });
  }

  // Process inventories from Packing List
  try {
    await Inventory.deleteMany({
      inventoryType: data.type === '1' ? 'shipment' : 'service',
      shipment: req.params.id,
      inventoryStr: { $ne: '' }, 
    });
  } catch (err) {
    return res.send({
      status: false,
      error: err.message || 'Can\t delete old inventories',
    });
  }

  const inventories = data.packagesTableData;
  for (const inventory of inventories) {
    let isEmptyRow = true;
    for (const key in inventory) {
      console.log(`${key}: ${inventory[key]}`);
      if (inventory[key] && inventory[key].length > 0) {
        isEmptyRow = false;
        break;
      }
    }

    if (isEmptyRow) continue;
    if (inventory.inventoryStr && inventory.inventoryStr.length > 0) {
      // from Packing List
      const arr = inventory.inventoryStr.split(',');
      let pieces = '';
      let idValue = '';
      let contentValue = '';
      if (arr.length >= 3) {
        [pieces, idValue, contentValue] = arr;
      }

      const tmp = inventory.warehouse;
      let idValue02 = '';
      let contentValue02 = '';
      if (tmp) {
        const arr = tmp.split('***');
        if (arr.length >= 2) {
          [idValue02, contentValue02] = arr;
        }
      }
      delete inventory.warehouse;

      const recordData = {
        ...inventory,
        user: currentUser.id,
        inventoryType: data.type === '1' ? 'shipment' : 'service',
        shipment: req.params.id,
        customer: data.customer,
        inventory: idValue,
        warehouse: idValue02 === '' ? null : idValue02,
      };

      // console.log('>>> recordData', recordData);
      try {
        await Inventory.findOneAndUpdate(
          {
            inventoryType: data.type === '1' ? 'shipment' : 'service',
            shipment: req.params.id,
            customer: data.customer,
            inventory: idValue,
          },
          {
            $set: recordData,
          },
          {
            upsert: true,
          }
        );
      } catch(err) {
        console.log('>>> err', err);
        return res.send({
          status: false,
          error: 'inventory create error',
        });
      }
    }
  }

  // return Success
  res.send({
    status: true,
    shipment: req.body,
  });
};

const remove = async (req, res) => {
  const { currentUser } = req;

  const shipment = await Shipment.findOne({
    // user: currentUser.id,
    _id: req.params.id,
  });

  if (!shipment) {
    return res.status(400).json({
      status: false,
      error: 'Shipment doesn`t exist',
    });
  }

  // delete the transaction inventories
  try {
    const condition = {
      inventoryType: "shipment",
      shipment,
    };

    const inventories = await Inventory.find(condition);

    for (const inventory of inventories) {
      await Inventory.deleteMany({
        inventoryStr: { $ne: '' },
        inventory,
      });  
    }
  } catch (err) {
    return res.send({
      status: false,
      error: err.message || 'Can\t delete old transaction inventories',
    });
  }

  // delete the inventories
  try {
    await Inventory.deleteMany({
      inventoryType: "shipment",
      shipment,
    });
  } catch (err) {
    return res.send({
      status: false,
      error: err.message || 'Can\t delete old inventories',
    });
  }

  Shipment.deleteOne({
    _id: req.params.id,
    // user: currentUser.id,
  })
    .then(() => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      res.status(500).send({
        status: false,
        error: err.message || 'Shipment Delete Error',
      });
    });
};

const sendEmail = async (req, res) => {
  const { currentUser } = req;
  const shipment = await Shipment.findOne({
    // user: currentUser.id,
    _id: req.params.id,
  });

  if (!shipment) {
    res.send({
      status: false,
      error: 'Shipment doesn`t exist',
    });
  }

  const customer = await Customer.findOne({
    // user: currentUser.id,
    _id: shipment.customer,
  });

  if (!customer) {
    res.send({
      status: false,
      error: 'Customer doesn`t exist',
    });
  }

  const uploadPath = path.join(FILES_PATH, 'shipment', req.params.id + '/');

  return Promise.resolve().then(() => {
    let sendRawEmailPromise;
    if (req.file) {
      const file_name = req.file.filename;

      const mail = mailcomposer({
        from: system_settings.REPLY_EMAIL,
        // to: customer.email,
        to: req.body.addresses,
        subject: 'Shipment SES message with attachment',
        text: 'Hi, this is a test message from SES with an attachment.',
        attachments: [
          {
            path: path.join(uploadPath, file_name),
          },
        ],
      });

      return new Promise((resolve, reject) => {
        mail.build((err, message) => {
          if (err) {
            // console.log('>>> mail.build > err', err);
            reject(`Error sending raw email: ${err}`);
          }
          // console.log('>>> mail.build success > message', message);
          sendRawEmailPromise = ses
            .sendRawEmail({ RawMessage: { Data: message } })
            .promise();
        });

        resolve(sendRawEmailPromise);
      })
        .then(() => {
          console.log('>>> sendEmail: sns publish success!');
          res.send({
            status: true,
          });
        })
        .catch((err) => {
          console.error('>>> sendEmail: error', err);
          res.send({
            status: false,
          });
        });
    }
  });
};

const sendText = async (req, res) => {
  const { currentUser } = req;
  const shipment = await Shipment.findOne({
    // user: currentUser.id,
    _id: req.params.id,
  });

  if (!shipment) {
    res.send({
      status: false,
      error: 'Shipment doesn`t exist',
    });
  }

  const customer = await Customer.findOne({
    // user: currentUser.id,
    _id: shipment.customer,
  });

  if (!customer) {
    res.send({
      status: false,
      error: 'Customer doesn`t exist',
    });
  }

  if (req.file) {
    const file_link = req.file.location;

    let addresses = [];
    if (req.body.addresses) {
      addresses = req.body.addresses.split(',');
    }
    console.log('>>> addresses', addresses);

    addresses.map((address) => {
      twilioClient.messages
      .create({
         body: 'Shipment Text message with pdf link: ' + file_link,
         from: system_settings.REPLY_NUMBER,
         to: address,
       })
       .then((message) => {
        console.log('>>> sendText: success!', message.sid);
        res.send({
          status: true,
        });
      })
      .catch((err) => {
        console.error('>>> sendText: error!', err);
        res.send({
          status: false,
        });
      });
    });
  }
};

const sendFax = async (req, res) => {
  const { currentUser } = req;
  const shipment = await Shipment.findOne({
    // user: currentUser.id,
    _id: req.params.id,
  });

  if (!shipment) {
    res.send({
      status: false,
      error: 'Shipment doesn`t exist',
    });
  }

  const customer = await Customer.findOne({
    // user: currentUser.id,
    _id: shipment.customer,
  });

  if (!customer) {
    res.send({
      status: false,
      error: 'Customer doesn`t exist',
    });
  }

  const uploadPath = path.join(FILES_PATH, 'shipment', req.params.id + '/');

  return Promise.resolve().then(() => {
    if (req.file) {
      const file_name = req.file.filename;

      console.log(
        '>>> sendFax: file to send: ' + path.join(uploadPath, file_name)
      );

      let addresses = [];
      if (req.body.addresses) {
        addresses = req.body.addresses.split(',');
      }
      console.log('>>> addresses', addresses);

      addresses.map((address) => {
        phaxio.sendFax(
          {
            to: address,
            filenames: [path.join(uploadPath, file_name)],
          },
          (err, res) => {
            console.log('>>> sendFax: phaxio sendFax callback, res', res);
            console.log('>>> sendFax: phaxio sendFax callback, err', err);
            res.send({
              status: false,
            });
          }
        );
        res.send({
          status: true,
        });
      });
    }
  });
};

const searchAddresses = async (req, res) => {
  const { searchText, status, page, limit } = req.body;
  const condition = {};
  if (searchText !== undefined && searchText.length > 0) {
    condition['$or'] = [
      {
        originFullAddr: { $regex: searchText + '.*', $options: 'i' },
      },
      {
        destFullAddr: { $regex: searchText + '.*', $options: 'i' },
      },
      {
        originPostalCode: { $regex: searchText + '.*', $options: 'i' },
      },
      {
        destPostalCode: { $regex: searchText + '.*', $options: 'i' },
      },
      {
        originCompany: { $regex: searchText + '.*', $options: 'i' },
      },
      {
        destCompany: { $regex: searchText + '.*', $options: 'i' },
      },
    ];
  }

  const totalCount = await Shipment.find(condition).count();

  console.log('>>> totalCount', totalCount);
  // {
  //   value: '1',
  //   label: 'Alphabetical A-Z'
  // },
  // {
  //   value: '2',
  //   label: 'Alphabetical Z-A'
  // },
  const sortOption = {};
  if (status === '1') {
    sortOption.description = 1;
  } else if (status === '2') {
    sortOption.description = -1;
  }
  const shipments = await Shipment.find(condition)
    .sort(sortOption)
    .skip(page * limit)
    .limit(limit);
  return res.send({
    status: true,
    shipments,
    totalCount,
  });
};

const uploadPhoto = async (req, res) => {
  const { currentUser } = req;

  let file_link = '';
  if (req.file) {
    file_link = req.file.location;
  }

  return res.json({
    status: true,
    photoURL: file_link,
  });
};

module.exports = {
  get,
  getAlsoRelated,
  loadByQuery,
  create,
  update,
  remove,
  sendEmail,
  sendText,
  sendFax,
  searchAddresses,
  uploadPhoto,
};
