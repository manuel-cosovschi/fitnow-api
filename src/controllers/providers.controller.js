// src/controllers/providers.controller.js
import * as provService from '../services/provider.service.js';

export async function list(req, res, next) {
  try {
    res.json(await provService.list(req.query));
  } catch (err) { next(err); }
}

export async function getById(req, res, next) {
  try {
    res.json(await provService.getById(Number(req.params.id)));
  } catch (err) { next(err); }
}

export async function create(req, res, next) {
  try {
    const provider = await provService.create(req.body);
    res.status(201).json(provider);
  } catch (err) { next(err); }
}

export async function update(req, res, next) {
  try {
    res.json(await provService.update(Number(req.params.id), req.body, req.user));
  } catch (err) { next(err); }
}

export async function activate(req, res, next) {
  try {
    res.json(await provService.activate(Number(req.params.id)));
  } catch (err) { next(err); }
}

export async function suspend(req, res, next) {
  try {
    res.json(await provService.suspend(Number(req.params.id)));
  } catch (err) { next(err); }
}

export async function setHours(req, res, next) {
  try {
    res.json(await provService.setHours(Number(req.params.id), req.body.hours, req.user));
  } catch (err) { next(err); }
}

export async function addService(req, res, next) {
  try {
    const svc = await provService.addService(Number(req.params.id), req.body, req.user);
    res.status(201).json(svc);
  } catch (err) { next(err); }
}

export async function removeService(req, res, next) {
  try {
    res.json(await provService.removeService(Number(req.params.id), Number(req.params.serviceId), req.user));
  } catch (err) { next(err); }
}

export async function getSports(req, res, next) {
  try {
    const services = await provService.getServices(Number(req.params.id));
    // iOS expects { items: [{ id, name }] }
    const items = services.map((s) => ({ id: s.sport_id, name: s.sport_name }));
    res.json({ items });
  } catch (err) { next(err); }
}
