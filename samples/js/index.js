const { set, Schema, model, connect, connection, plugin } = require('mongoose');
const { SoftDelete } = require('soft-delete-mongoose-plugin');

async function main() {
  set('debug', true);

  await connect(
    'mongodb://localhost:27017/test?readPreference=primary&appname=MongoDB%20Compass&directConnection=true&ssl=false',
  );

  // defind soft delete field name
  const SOFT_DELETE_FIELD = 'deleteAt';

  // use as global plugin
  plugin(new SoftDelete(SOFT_DELETE_FIELD).getPlugin());

  const studentSchema = new Schema({
    name: { type: String, required: true },
    [SOFT_DELETE_FIELD]: { type: Date, default: null }, // soft delete field type is Date or null
  });

  const StudentModel = model('students', studentSchema);

  // It's ready to use studentModel to soft delete documents
  await StudentModel.softDeleteMany();

  await connection.close();
}

main();
