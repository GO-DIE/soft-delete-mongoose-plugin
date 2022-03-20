import { SoftDelete, SoftDeleteModel } from '../src';
import {
  set,
  Schema,
  model,
  connect,
  connection,
  Types,
  Document,
} from 'mongoose';

set('debug', true);

const SOFT_DELETED_FIELD = 'deleteAt';
const WITH_SOFT_DELETED_FILTER = { [SOFT_DELETED_FIELD]: { $ne: null } };
const enum CollectionEnum {
  classes = 'classes',
  students = 'students',
}

interface ISoftDelete {
  [SOFT_DELETED_FIELD]: Date | null;
}

interface IClass {
  grade: number;
  teacher: string;
}
type ClassWithSoftDelete = IClass & ISoftDelete;
type ClassDocument = ClassWithSoftDelete & Document;

interface IStudent {
  classId: Types.ObjectId;
  name: string;
  age: number;
  avatar?: string;
}
type StudentWithSoftDelete = IStudent & ISoftDelete;
type StudentDocument = StudentWithSoftDelete & Document;

type UnassignedClassStudent = Omit<IStudent, 'classId'>;
type AggregateDoc = ClassDocument & { students: StudentDocument[] };

const class1: IClass = {
  grade: 1,
  teacher: 'Zhang',
};

const class2: IClass = {
  grade: 1,
  teacher: 'Li',
};

const zhangSan: UnassignedClassStudent = {
  name: 'Zhang San',
  age: 3,
  avatar: 'https://pic.com/san.png',
};

const liSi: UnassignedClassStudent = {
  name: 'Li Si',
  age: 4,
  avatar: 'https://pic.com/si.png',
};

describe('mongoose soft deleted plugin', () => {
  let ClassModel: SoftDeleteModel<ClassWithSoftDelete>;
  let StudentModel: SoftDeleteModel<StudentWithSoftDelete>;
  let classDocs: ClassDocument[];
  let class1Doc: ClassDocument;
  let class2Doc: ClassDocument;
  let studentDocs: StudentDocument[];
  let class1Student1Doc: StudentDocument;
  let class2Student2Doc: StudentDocument;

  beforeAll(async () => {
    await connect(
      'mongodb://localhost:27017/test?readPreference=primary&appname=MongoDB%20Compass&directConnection=true&ssl=false',
    );
    const serverInfo = await connection.db.admin().serverInfo();
    const softDeletePlugin = new SoftDelete(SOFT_DELETED_FIELD, {
      mongoDBVersion: serverInfo.version,
    }).getPlugin();

    const classSchema = new Schema<
      ClassWithSoftDelete,
      SoftDeleteModel<ClassWithSoftDelete>
    >({
      grade: { type: Number, required: true },
      teacher: { type: String, required: true },
      deleteAt: { type: Date, default: null },
    });

    classSchema.plugin(softDeletePlugin);

    ClassModel = model<
      ClassWithSoftDelete,
      SoftDeleteModel<ClassWithSoftDelete>
    >(CollectionEnum.classes, classSchema);

    const studentSchema = new Schema<
      StudentWithSoftDelete,
      SoftDeleteModel<StudentWithSoftDelete>
    >({
      classId: { type: Schema.Types.ObjectId, required: true },
      name: { type: String, required: true },
      age: { type: Number, required: true },
      avatar: { type: String, required: false },
      deleteAt: { type: Date, default: null },
    });

    studentSchema.plugin(softDeletePlugin);

    StudentModel = model<
      StudentWithSoftDelete,
      SoftDeleteModel<StudentWithSoftDelete>
    >(CollectionEnum.students, studentSchema);
  });

  afterAll(async () => {
    await connection.close();
  });

  beforeEach(async () => {
    await connection.db.dropDatabase();
    classDocs = await ClassModel.insertMany([class1, class2]);
    [class1Doc, class2Doc] = classDocs;
    studentDocs = await StudentModel.insertMany([
      {
        classId: class1Doc._id,
        ...zhangSan,
      },
      {
        classId: class2Doc._id,
        ...liSi,
      },
    ]);
    [class1Student1Doc, class2Student2Doc] = studentDocs;
    class1Student1Doc;
  });

  describe('new soft delete methods', () => {
    test('softDeleteOne', async () => {
      await ClassModel.softDeleteOne();
      const classDocs = await ClassModel.find();
      expect(classDocs.length).toEqual(1);
      expect(classDocs[0].toObject()).toEqual(class2Doc.toObject());
    });

    test('softDeleteMany', async () => {
      await ClassModel.softDeleteMany();
      const classDocs = await ClassModel.find();
      expect(classDocs.length).toEqual(0);
    });

    test('findByIdAndSoftDelete', async () => {
      const [class1Doc, class2Doc] = await ClassModel.find();
      const findByIdAndSoftDeleteResultClass1Doc =
        await ClassModel.findByIdAndSoftDelete(class1Doc!._id);
      expect(findByIdAndSoftDeleteResultClass1Doc!.toObject()).toEqual(
        class1Doc.toObject(),
      );

      const classDocs = await ClassModel.find();
      expect(classDocs[0].toObject()).toEqual(class2Doc.toObject());
    });
  });

  describe('overrided methods', () => {
    // [
    //   'aggregate',
    //   'bulkWrite',
    //   'count',
    //   'countDocuments',
    //   // 'create',
    //   // 'deleteMany',
    //   // 'deleteOne',
    //   'distinct',
    //   'exists',
    //   'find',
    //   'findById',
    //   'findByIdAndDelete',
    //   'findByIdAndRemove',
    //   'findByIdAndUpdate',
    //   'findOne',
    //   'findOneAndDelete',
    //   // 'findOneAndRemove',
    //   'findOneAndReplace',
    //   'findOneAndUpdate',
    //   // 'insertMany',
    //   // 'deleteOne',
    //   // 'remove',
    //   // 'save',
    //   // 'remove',
    //   'replaceOne',
    //   'update',
    //   'updateMany',
    //   'updateOne',
    // ]
    describe('aggregate', () => {
      test('aggregate', async () => {
        const aggregateDocs = await ClassModel.aggregate<AggregateDoc>([
          {
            $lookup: {
              from: CollectionEnum.students,
              localField: '_id',
              foreignField: 'classId',
              as: 'students',
            },
          },
        ]);

        aggregateDocs.forEach((doc, index) => {
          expect(doc).toEqual({
            ...classDocs[index].toObject(),
            students: [studentDocs[index].toObject()],
          });
        });
      });

      test('aggregate main collection soft deleted', async () => {
        await ClassModel.deleteOne();
        const [aggregateDoc] = await ClassModel.aggregate<AggregateDoc>([
          {
            $lookup: {
              from: CollectionEnum.students,
              localField: '_id',
              foreignField: 'classId',
              as: 'students',
            },
          },
        ]);
        expect(aggregateDoc).toEqual({
          ...class2Doc.toObject(),
          students: [class2Student2Doc.toObject()],
        });
      });

      test('aggregate sub collection soft deleted', async () => {
        await StudentModel.deleteOne();
        const [class1Student1, class2Student2] =
          await ClassModel.aggregate<AggregateDoc>([
            {
              $lookup: {
                from: CollectionEnum.students,
                localField: '_id',
                foreignField: 'classId',
                as: 'students',
              },
            },
          ]);
        expect(class1Student1).toEqual({
          ...class1Doc.toObject(),
          students: [],
        });
        expect(class2Student2).toEqual({
          ...class2Doc.toObject(),
          students: [class2Student2Doc.toObject()],
        });
      });
    });

    test('find', async () => {
      const classDocs = await ClassModel.find();
      expect(classDocs.length).toEqual(2);
    });

    test('findById', async () => {
      const classDoc = await ClassModel.findById(class1Doc._id);
      expect(classDoc!.toObject()).toEqual(class1Doc.toObject());
    });

    test('findByIdAndDelete', async () => {
      await ClassModel.findByIdAndDelete(class1Doc._id);
      const classDoc = await ClassModel.findOne({
        _id: class1Doc._id,
        ...WITH_SOFT_DELETED_FILTER,
      });
      expect(classDoc).toBeNull();
    });

    test('findByIdAndRemove', async () => {
      await ClassModel.findByIdAndRemove(class1Doc._id);
      const classDoc = await ClassModel.findOne({
        _id: class1Doc._id,
        ...WITH_SOFT_DELETED_FILTER,
      });
      expect(classDoc).toBeNull();
    });

    test('findOne', async () => {
      const classDoc = await ClassModel.findOne();
      expect(classDoc!.toObject()).toEqual(class1Doc.toObject());
    });
  });
});
