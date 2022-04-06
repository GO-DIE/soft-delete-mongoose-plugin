/* eslint-disable @typescript-eslint/no-var-requires */
const { set, Schema, model, connect, connection, plugin } = require('mongoose');
const { SoftDelete } = require('soft-delete-mongoose-plugin');

async function main() {
  set('debug', true);

  await connect('mongodb://localhost:27017/test?directConnection=true');

  // defind soft delete field name
  const IS_DELETED_FIELD = 'isDeleted';
  const DELETED_AT_FIELD = 'deletedAt';

  // use soft delete plugin
  plugin(
    new SoftDelete({
      isDeletedField: IS_DELETED_FIELD,
      deletedAtField: DELETED_AT_FIELD,
    }).getPlugin(),
  );

  const personSchema = new Schema({
    name: { type: String, required: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  });

  // use of the SoftDeleteModel type, instead of the Model type.
  const personModel = model('persons', personSchema);

  // It's ready to use studentModel to soft delete documents
  await personModel.softDeleteMany();

  await connection.close();
}

main();
