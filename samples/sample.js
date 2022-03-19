const { connect, Schema, model } = require('mongoose');
const { SoftDelete } = require('');

async function main () {
  await connect('mongodb://localhost:27017/test');

  const SOFT_DELETE_FIELD = 'deleteAt';
  const kittySchema = new Schema({
    name: { type: String, required: true },
    [SOFT_DELETE_FIELD]: { type: Date, default: null },
  });

  const softDeletePlugin = new SoftDelete(SOFT_DELETE_FIELD).getPlugin();
  kittySchema.plugin();

  const Kitten = model('Kitten', kittySchema);
  Kitten.softDeleteMany();
};
