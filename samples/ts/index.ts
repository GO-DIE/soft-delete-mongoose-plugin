import { set, Schema, model, connect, connection } from 'mongoose';
import { SoftDelete, SoftDeleteModel } from 'soft-delete-mongoose-plugin';

set('debug', true);

async function main() {
  await connect(
    'mongodb://localhost:27017/test?readPreference=primary&appname=MongoDB%20Compass&directConnection=true&ssl=false',
  );

  // defind soft delete field name
  const SOFT_DELETED_FIELD = 'deleteAt';

  interface Student {
    name: string;
    [SOFT_DELETED_FIELD]: Date | null; // soft delete field type is Date or null
  }

  // use of the SoftDeleteModel type, instead of the Model type.
  const studentSchema = new Schema<Student, SoftDeleteModel<Student>>({
    name: { type: String, required: true },
    deleteAt: { type: Date, default: null },
  });

  studentSchema.plugin(new SoftDelete(SOFT_DELETED_FIELD).getPlugin());

  // use of the SoftDeleteModel type, instead of the Model type.
  const studentModel = model<Student, SoftDeleteModel<Student>>(
    'students',
    studentSchema,
  );

  // It's ready to use studentModel to soft delete documents
  await studentModel.softDeleteMany();

  await connection.close();
}

main();
