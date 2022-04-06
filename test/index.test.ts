import { SoftDelete, SoftDeleteModel } from '../src';
import {
  set,
  createConnection,
  Schema,
  Connection,
  Types,
  Document,
  ObjectId,
  Model,
} from 'mongoose';
import * as _ from 'lodash';

set('debug', true);

const IS_DELETED_FIELD = 'isDeleted';
const DELETED_AT_FIELD = 'deleteAt';
const ONLY_DELETED_FILTER = { [IS_DELETED_FIELD]: true };
const NON_DELETED_FILTER = { [IS_DELETED_FIELD]: { $ne: true } };
const enum CollectionEnum {
  classes = 'classes',
  students = 'students',
}

interface Base {
  _id: ObjectId;
}

interface ISoftDelete {
  [IS_DELETED_FIELD]: boolean;
  [DELETED_AT_FIELD]: Date | null;
}

interface IClass extends ISoftDelete, Base {
  grade: number;
  teacher: string;
  nextGrade: number;
}
type ClassDocument = IClass & Document;

interface IStudent extends ISoftDelete, Base {
  classId: Types.ObjectId;
  name: string;
  age: number;
  avatar?: string;
}
type StudentDocument = IStudent & Document;

type ClassWithStudent = IClass & {
  students: IStudent[];
};

function deleteSoftDeleteField<T = Record<string, unknown> & ISoftDelete>(
  docs: T[],
): Omit<T, keyof ISoftDelete>[] {
  return docs.map(doc =>
    Object.assign({}, doc, {
      [IS_DELETED_FIELD]: null,
      [DELETED_AT_FIELD]: null,
    }),
  );
}

function checkDeletionValidity<T = Record<string, unknown> & ISoftDelete>(
  deleteds: T[],
  originals: T[],
) {
  deleteds.forEach(doc => {
    expect(doc[IS_DELETED_FIELD]).toBe(true);
    expect(doc[DELETED_AT_FIELD]).toBeInstanceOf(Date);
  });

  originals.forEach(original => {
    expect(original[IS_DELETED_FIELD]).toBe(false);
    expect(original[DELETED_AT_FIELD]).toBeNull();
  });

  expect(deleteSoftDeleteField(deleteds)).toEqual(
    deleteSoftDeleteField(originals),
  );
}

describe('mongoose soft deleted plugin', () => {
  let softDeleteConn: Connection;
  let ClassModel: SoftDeleteModel<IClass>;
  let StudentModel: SoftDeleteModel<IStudent>;
  let classDocs: ClassDocument[];
  let class1Doc: ClassDocument;
  let class2Doc: ClassDocument;
  let classes: IClass[];
  let class1: IClass;
  let class2: IClass;
  let studentDocs: StudentDocument[];
  let zhangSanDoc: StudentDocument;
  let liSiDoc: StudentDocument;
  let students: IStudent[];
  let zhangSan: IStudent;
  let liSi: IStudent;

  let directConn: Connection;
  let ClassModelDirect: Model<IClass>;
  let StudentModelDirect: Model<IStudent>;

  beforeAll(async () => {
    const mongodbURL =
      'mongodb://localhost:27017/test?readPreference=primary&appname=MongoDB%20Compass&directConnection=true&ssl=false';

    softDeleteConn = await createConnection(mongodbURL).asPromise();
    // const serverInfo = await softDeleteConn.db.admin().serverInfo();
    const softDeletePlugin = new SoftDelete({
      isDeletedField: IS_DELETED_FIELD,
      deletedAtField: DELETED_AT_FIELD,
      // mongoDBVersion: serverInfo.version,
    }).getPlugin();
    softDeleteConn.plugin(softDeletePlugin);

    const classSchemaDefinition = {
      grade: { type: Number, required: true },
      teacher: { type: String, required: true },
      nextGrade: { type: Number, required: true },
      isDeleted: { type: Boolean, default: false },
      deleteAt: { type: Date, default: null },
    };

    const studentSchemaDefinition = {
      classId: { type: Schema.Types.ObjectId, required: true },
      name: { type: String, required: true },
      age: { type: Number, required: true },
      avatar: { type: String, required: false },
      isDeleted: { type: Boolean, default: false },
      deleteAt: { type: Date, default: null },
    };

    const classSchema = new Schema<IClass>(classSchemaDefinition);
    ClassModel = softDeleteConn.model<IClass, SoftDeleteModel<IClass>>(
      CollectionEnum.classes,
      classSchema,
    );

    const studentSchema = new Schema<IStudent, SoftDeleteModel<IStudent>>(
      studentSchemaDefinition,
    );
    StudentModel = softDeleteConn.model<IStudent, SoftDeleteModel<IStudent>>(
      CollectionEnum.students,
      studentSchema,
    );

    directConn = await createConnection(mongodbURL);

    const classSchemaDirect = new Schema<IClass>(classSchemaDefinition);
    ClassModelDirect = directConn.model<IClass>(
      CollectionEnum.classes,
      classSchemaDirect,
    );

    const studentSchemaDirect = new Schema<IStudent>(studentSchemaDefinition);
    StudentModelDirect = directConn.model<IStudent>(
      CollectionEnum.students,
      studentSchemaDirect,
    );
  });

  afterAll(async () => {
    await softDeleteConn.close();
    await directConn.close();
  });

  beforeEach(async () => {
    await softDeleteConn.dropDatabase();
    [class1Doc, class2Doc] = classDocs = await ClassModel.insertMany([
      {
        grade: 1,
        teacher: 'Zhang',
        nextGrade: 2,
      },
      {
        grade: 2,
        teacher: 'Li',
        nextGrade: 3,
      },
    ]);
    [class1, class2] = classes = classDocs.map(classDoc => classDoc.toObject());

    [zhangSanDoc, liSiDoc] = studentDocs = await StudentModel.insertMany([
      {
        classId: class1Doc._id,
        name: 'Zhang San',
        age: 3,
        avatar: 'https://pic.com/san.png',
      },
      {
        classId: class2Doc._id,
        name: 'Li Si',
        age: 4,
        avatar: 'https://pic.com/si.png',
      },
    ]);
    [zhangSan, liSi] = students = studentDocs.map(studentDoc =>
      studentDoc.toObject(),
    );
  });

  describe('Basic functional', () => {
    describe('Soft delete methods', () => {
      test('softDeleteOne', async () => {
        await ClassModel.softDeleteOne();

        const softDeleteds = await ClassModelDirect.find(
          ONLY_DELETED_FILTER,
        ).lean();
        checkDeletionValidity(softDeleteds, [class1]);

        const nonSoftDeleted = await ClassModelDirect.find(
          NON_DELETED_FILTER,
        ).lean();
        expect(nonSoftDeleted).toEqual([class2]);
      });

      test('softDeleteMany', async () => {
        await ClassModel.softDeleteMany();

        const softDeleteds = await ClassModelDirect.find(
          ONLY_DELETED_FILTER,
        ).lean();
        checkDeletionValidity(softDeleteds, classes);

        const nonSoftDeleteds = await ClassModelDirect.find(
          NON_DELETED_FILTER,
        ).lean();
        expect(nonSoftDeleteds).toHaveLength(0);
      });

      test('findByIdAndSoftDelete', async () => {
        await ClassModel.findByIdAndSoftDelete(class2._id);

        const softDeleteds = await ClassModelDirect.find(
          ONLY_DELETED_FILTER,
        ).lean();
        checkDeletionValidity(softDeleteds, [class2]);

        const nonSoftDeleteds = await ClassModelDirect.find(
          NON_DELETED_FILTER,
        ).lean();
        expect(nonSoftDeleteds).toEqual([class1]);
      });
    });

    describe('Overidden metheds', () => {
      describe('aggregate', () => {
        test('match stage', async () => {
          const pipelineStages = [
            {
              $match: {
                grade: class1.grade,
              },
            },
          ];
          const result = await ClassModel.aggregate(pipelineStages);
          const resultDirect = await ClassModelDirect.aggregate(pipelineStages);
          expect(result).toEqual(resultDirect);
        });

        test('lookup stage', async () => {
          const pipelineStages = [
            {
              $lookup: {
                from: CollectionEnum.students,
                localField: '_id',
                foreignField: 'classId',
                as: 'students',
              },
            },
          ];
          const result = await ClassModel.aggregate(pipelineStages);
          const resultDirect = await ClassModelDirect.aggregate(pipelineStages);
          expect(result).toEqual(resultDirect);
        });

        test('groupLookup stage', async () => {
          const pipelineStages = [
            {
              $graphLookup: {
                from: CollectionEnum.classes,
                startWith: '$nextGrade',
                connectFromField: 'nestGrade',
                connectToField: 'grade',
                as: 'next',
              },
            },
          ];
          const result = await ClassModel.aggregate(pipelineStages);
          const resultDirect = await ClassModelDirect.aggregate(pipelineStages);
          expect(result).toEqual(resultDirect);
        });
      });

      describe('bulkWrite', () => {
        test('updateOne', async () => {
          const wang = 'Wang';
          const writes = [
            {
              updateOne: {
                filter: { _id: class1._id },
                update: { $set: { teacher: wang } },
              },
            },
          ];
          await ClassModel.bulkWrite(writes);
          const resultDirect = await ClassModelDirect.findById(
            class1._id,
          ).lean();
          expect(resultDirect).toEqual({ ...class1, teacher: wang });
        });

        test('updateMany', async () => {
          const wang = 'Wang';
          const writes = [
            {
              updateMany: {
                filter: {},
                update: { $set: { teacher: wang } },
              },
            },
          ];
          await ClassModel.bulkWrite(writes);
          const resultDirect = await ClassModelDirect.find().lean();
          expect(resultDirect).toEqual(
            classes.map(class1 => ({ ...class1, teacher: wang })),
          );
        });

        test('replaceOne', async () => {
          const replacement = _.cloneDeep(class2);
          delete replacement._id;
          const writes = [
            {
              replaceOne: {
                filter: { _id: class1._id },
                replacement,
              },
            },
          ];
          await ClassModel.bulkWrite(writes);
          const resultDirect = await ClassModelDirect.findById(
            class1._id,
          ).lean();
          expect(resultDirect).toEqual({ _id: class1._id, ...replacement });
        });
      });

      test('count', async () => {
        const count = await ClassModel.count();
        const countDirect = await ClassModelDirect.count();
        expect(count).toEqual(countDirect);
      });

      test('countDocuments', async () => {
        const count = await ClassModel.countDocuments();
        const countDirect = await ClassModelDirect.countDocuments();
        expect(count).toEqual(countDirect);
      });

      test('distinct', async () => {
        const distinct = await ClassModel.distinct('teacher');
        const distinctDirect = await ClassModelDirect.distinct('teacher');
        expect(distinct).toEqual(distinctDirect);
      });

      test('exists', async () => {
        const exists = await ClassModel.exists({});
        const existsDirect = await ClassModelDirect.exists({});
        expect(exists).toEqual(existsDirect);
      });

      test('find', async () => {
        const result = await ClassModel.find();
        const resultDirect = await ClassModelDirect.find();
        expect(result).toEqual(resultDirect);
      });

      test('findById', async () => {
        const result = await ClassModel.findById(class1._id);
        const resultDirect = await ClassModelDirect.findById(class1._id);
        expect(result).toEqual(resultDirect);
      });

      test('findByIdAndUpdate', async () => {
        const result = await ClassModel.findByIdAndUpdate(
          class1._id,
          {
            teacher: 'Wang',
          },
          { new: true },
        );
        const resultDirect = await ClassModelDirect.findById(class1._id);
        expect(result).toEqual(resultDirect);
      });

      test('findOneAndReplace', async () => {
        const replacement = _.cloneDeep(class2);
        delete replacement._id;
        const result = await ClassModel.findOneAndReplace(
          { _id: class1._id },
          replacement,
          { new: true },
        );
        const resultDirect = await ClassModelDirect.findById(class1._id);
        expect(result).toEqual(resultDirect);
      });

      test('findOneAndUpdate', async () => {
        const replacement = _.cloneDeep(class2);
        delete replacement._id;
        const result = await ClassModel.findOneAndReplace(
          { _id: class1._id },
          replacement,
          { new: true },
        );
        const resultDirect = await ClassModelDirect.findById(class1._id);
        expect(result).toEqual(resultDirect);
      });

      test('replaceOne', async () => {
        const replacement = _.cloneDeep(class2);
        delete replacement._id;
        await ClassModel.replaceOne({ _id: class1._id }, replacement);
        const result = await ClassModel.findById(class1._id);
        const resultDirect = await ClassModelDirect.findById(class1._id);
        expect(result).toEqual(resultDirect);
      });

      test('update', async () => {
        await ClassModel.update(
          { _id: class1._id },
          { $set: { teacher: 'Wang' } },
        );
        const result = await ClassModel.findById(class1._id);
        const resultDirect = await ClassModelDirect.findById(class1._id);
        expect(result).toEqual(resultDirect);
      });

      test('updateMany', async () => {
        await ClassModel.updateMany({}, { $set: { teacher: 'Wang' } });
        const result = await ClassModel.find();
        const resultDirect = await ClassModelDirect.find();
        expect(result).toEqual(resultDirect);
      });

      test('updateOne', async () => {
        await ClassModel.updateOne(
          { _id: class1._id },
          { $set: { teacher: 'Wang' } },
        );
        const result = await ClassModel.findById(class1._id);
        const resultDirect = await ClassModelDirect.findById(class1._id);
        expect(result).toEqual(resultDirect);
      });
    });
  });

  describe('soft delete docs', () => {
    let class1SoftDeletedDoc: ClassDocument;
    let studentSoftDeletedDoc: StudentDocument;
    let class1SoftDeleted: IClass;
    let studentSoftDeleted: IStudent;
    beforeEach(async () => {
      class1SoftDeletedDoc = await ClassModel.findByIdAndSoftDelete(
        class1._id,
        { new: true },
      );
      class1SoftDeleted = class1SoftDeletedDoc.toObject();
      studentSoftDeletedDoc = await StudentModel.findByIdAndSoftDelete(
        liSi._id,
        { new: true },
      );
      studentSoftDeleted = studentSoftDeletedDoc.toObject();
    });

    describe('Overidden metheds', () => {
      describe('aggregate', () => {
        test('match stage', async () => {
          const result = await ClassModel.aggregate([]);
          expect(result).toEqual([class2]);
        });

        test('lookup stage', async () => {
          const pipelineStages = [
            {
              $lookup: {
                from: CollectionEnum.students,
                localField: '_id',
                foreignField: 'classId',
                as: 'students',
              },
            },
          ];
          const result = await ClassModel.aggregate(pipelineStages);
          expect(result).toEqual([{ ...class2, students: [] }]);
        });

        test('groupLookup stage', async () => {
          const pipelineStages = [
            {
              $graphLookup: {
                from: CollectionEnum.classes,
                startWith: '$nextGrade',
                connectFromField: 'nestGrade',
                connectToField: 'grade',
                as: 'next',
              },
            },
          ];
          const result = await ClassModel.aggregate(pipelineStages);
          expect(result).toEqual([{ ...class2, next: [] }]);
        });
      });

      describe('bulkWrite', () => {
        test('updateOne', async () => {
          const wang = 'Wang';
          const writes = [
            {
              updateOne: {
                filter: { _id: class1._id },
                update: { $set: { teacher: wang } },
              },
            },
          ];
          await ClassModel.bulkWrite(writes);
          const resultDirect = await ClassModelDirect.findById(
            class1._id,
          ).lean();
          expect(resultDirect).toEqual(class1SoftDeleted);
        });

        test('updateMany', async () => {
          const wang = 'Wang';
          const writes = [
            {
              updateMany: {
                filter: {},
                update: { $set: { teacher: wang } },
              },
            },
          ];
          await ClassModel.bulkWrite(writes);
          const resultDirect = await ClassModelDirect.find().lean();
          expect(resultDirect).toEqual([
            class1SoftDeleted,
            { ...class2, teacher: wang },
          ]);
        });

        test('replaceOne', async () => {
          const replacement = _.cloneDeep(class2);
          delete replacement._id;
          const writes = [
            {
              replaceOne: {
                filter: { _id: class1._id },
                replacement,
              },
            },
          ];
          await ClassModel.bulkWrite(writes);
          const resultDirect = await ClassModelDirect.findById(
            class1._id,
          ).lean();
          expect(resultDirect).toEqual(class1SoftDeleted);
        });
      });

      test('count', async () => {
        const count = await ClassModel.count();
        expect(count).toEqual(1);
      });

      test('countDocuments', async () => {
        const count = await ClassModel.countDocuments();
        expect(count).toEqual(1);
      });

      test('distinct', async () => {
        const distinct = await ClassModel.distinct('teacher', {
          _id: class1._id,
        });
        expect(distinct).toHaveLength(0);
      });

      test('exists', async () => {
        const exists = await ClassModel.exists({ _id: class1._id });
        expect(exists).toBeNull;
      });

      test('find', async () => {
        const result = await ClassModel.find().lean();
        expect(result).toEqual([class2]);
      });

      test('findById', async () => {
        const result = await ClassModel.findById(class1._id);
        expect(result).toBeNull;
      });

      test('findByIdAndUpdate', async () => {
        const result = await ClassModel.findByIdAndUpdate(
          class1._id,
          {
            teacher: 'Wang',
          },
          { new: true },
        );
        expect(result).toBeNull;
      });

      test('findOneAndReplace', async () => {
        const replacement = _.cloneDeep(class2);
        delete replacement._id;
        const result = await ClassModel.findOneAndReplace(
          { _id: class1._id },
          replacement,
          { new: true },
        );
        expect(result).toBeNull;
      });

      test('findOneAndUpdate', async () => {
        const replacement = _.cloneDeep(class2);
        delete replacement._id;
        const result = await ClassModel.findOneAndReplace(
          { _id: class1._id },
          replacement,
          { new: true },
        );
        expect(result).toBeNull;
      });

      test('replaceOne', async () => {
        const replacement = _.cloneDeep(class2);
        delete replacement._id;
        const result = await ClassModel.replaceOne(
          { _id: class1._id },
          replacement,
          { new: true },
        );
        expect(result).toBeNull;
      });

      test('update', async () => {
        await ClassModel.update(
          { _id: class1._id },
          { $set: { teacher: 'Wang' } },
          { new: true },
        );
        const result = await ClassModel.findById(class1._id);
        expect(result).toBeNull;
      });

      test('updateMany', async () => {
        const wang = 'Wang';
        await ClassModel.updateMany({}, { $set: { teacher: wang } });
        const resultDirect = await ClassModelDirect.find().lean();
        expect(resultDirect).toEqual([
          class1SoftDeleted,
          { ...class2, teacher: wang },
        ]);
      });

      test('updateOne', async () => {
        const result = await ClassModel.updateOne(
          { _id: class1._id },
          { $set: { teacher: 'Wang' } },
          { new: true },
        );
        expect(result).toBeNull;
      });
    });
  });
});
