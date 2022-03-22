const { set, Schema, model, connect, connection } = require('mongoose');
const { SoftDelete } = require('soft-delete-mongoose-plugin');

set('debug', true);

async function main() {
  await connect(
    'mongodb://localhost:27017/test?readPreference=primary&appname=MongoDB%20Compass&directConnection=true&ssl=false',
  );

  // defind soft delete field name
  const SOFT_DELETE_FIELD = 'deleteAt';
  const studentSchema = new Schema({
    name: { type: String, required: true },
    [SOFT_DELETE_FIELD]: { type: Date, default: null }, // soft delete field type is Date or null
  });

  studentSchema.plugin(new SoftDelete(SOFT_DELETE_FIELD).getPlugin());

  const StudentModel = model('students', studentSchema);
  // It's ready to use studentModel to soft delete documents
  await StudentModel.softDeleteMany();

  await connection.close();
}

main();
