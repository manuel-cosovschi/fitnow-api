// src/controllers/offers.controller.js
import * as offerService from '../services/offer.service.js';

export async function create(req, res, next) {
  try {
    if (!req.user.provider_id) {
      return res.status(403).json({ code: 'NO_PROVIDER', message: 'No tenés proveedor asignado.' });
    }
    const offer = await offerService.create(req.user.provider_id, req.body);
    res.status(201).json(offer);
  } catch (err) { next(err); }
}

export async function listApproved(req, res, next) {
  try {
    res.json(await offerService.listApproved(req.query));
  } catch (err) { next(err); }
}

export async function listMine(req, res, next) {
  try {
    if (!req.user.provider_id) {
      return res.status(403).json({ code: 'NO_PROVIDER', message: 'No tenés proveedor asignado.' });
    }
    res.json(await offerService.listMine(req.user.provider_id, req.query));
  } catch (err) { next(err); }
}
