import { SoftDelete, SoftDeleteModel } from './../index';
import { set, Schema, model, connect } from 'mongoose';

set('debug', true);

async function main() {
  await connect('mongodb://localhost:27017/test');

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
}

main();
