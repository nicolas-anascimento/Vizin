import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { text, boolean, uuid } from "../utils/validation.ts";
export const listAddresses: RequestHandler = async (req, res) => { res.json(await prisma.enderecos.findMany({ where: { usuario_id: req.user!.id }, orderBy: { principal: "desc" } })); };
export const getAddress: RequestHandler = async(req,res) => {
 const address=await prisma.enderecos.findFirst({where:{id:uuid(req.params.id),usuario_id:req.user!.id}});
 if(!address)throw new HttpError(404,"Endereço não encontrado");res.json(address);
};
export const saveAddress: RequestHandler = async (req, res) => {
 const id = req.params.id ? uuid(req.params.id) : undefined;
 const current = id ? await prisma.enderecos.findFirst({ where: { id, usuario_id: req.user!.id } }) : null;
 if (id && !current) throw new HttpError(404, "Endereço não encontrado");
 const body = { ...current, ...req.body };
 const cep = text(body.cep, "CEP", 10).replace(/\D/g, "");
 if (cep.length !== 8) throw new HttpError(422, "CEP inválido");
 const estado = text(body.estado, "Estado", 2).toUpperCase();
 if (!"AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ").includes(estado)) throw new HttpError(422, "Estado inválido");
 const lat = body.latitude == null || body.latitude === "" ? null : Number(body.latitude);
 const lon = body.longitude == null || body.longitude === "" ? null : Number(body.longitude);
 if ((lat === null) !== (lon === null) || (lat !== null && (!Number.isFinite(lat) || Math.abs(lat) > 90)) || (lon !== null && (!Number.isFinite(lon) || Math.abs(lon) > 180))) throw new HttpError(422, "Coordenadas inválidas");
 const principal = body.principal == null ? false : boolean(body.principal, "Principal");
 const data = { usuario_id: req.user!.id, cep, rua: text(body.rua, "Rua", 200), numero: text(body.numero, "Número", 10), bairro: text(body.bairro, "Bairro", 100), cidade: text(body.cidade, "Cidade", 100), estado, complemento: body.complemento ? text(body.complemento, "Complemento", 100) : null, principal, latitude: lat, longitude: lon };
 const result = await prisma.$transaction(async tx => {
  await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${req.user!.id}::uuid FOR UPDATE`;
  if (principal) await tx.enderecos.updateMany({ where: { usuario_id: req.user!.id }, data: { principal: false } });
  const address = id ? await tx.enderecos.update({ where: { id }, data }) : await tx.enderecos.create({ data });
  if (lat !== null && lon !== null) await tx.$executeRaw`UPDATE enderecos SET localizacao = ST_SetSRID(ST_MakePoint(${lon}, ${lat}),4326)::geography WHERE id = ${address.id}::uuid`;
  else await tx.$executeRaw`UPDATE enderecos SET localizacao = NULL WHERE id = ${address.id}::uuid`;
  return address;
 });
 res.status(id ? 200 : 201).json(result);
};
export const removeAddress: RequestHandler = async (req, res) => {
 await prisma.$transaction(async tx => {
  const address = await tx.enderecos.findFirst({ where: { id: uuid(req.params.id), usuario_id: req.user!.id } });
  if (!address) throw new HttpError(404, "Endereço não encontrado");
  if (await tx.itens.count({ where: { endereco_id: address.id, arquivado: false } })) throw new HttpError(409, "Endereço utilizado por anúncio");
  await tx.itens.updateMany({ where: { endereco_id: address.id }, data: { endereco_id: null } });
  await tx.enderecos.delete({ where: { id: address.id } });
 }, { isolationLevel: "Serializable" });
 res.json({ success: true });
};
