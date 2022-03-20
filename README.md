soft-delete-mongoose-plugin
================

A simple and friendly soft delete plugin for mongoose，implementation using TS.

Methods were added and overridden on mongoose model to realize soft deletion logic.

# Features

- Soft delete data using delete time markers is friendly for scenarios where a unique index needs to be created
- Support customizable soft delete field identification, field type of Date | null
- [Add independent soft delete methods to the mongoose model](#soft-delete-methods), all hard delete methods are retained completely
- Rewrite all query and update methods on mongoose Model and automatically inject soft delete filtering conditions; If the user filter contains any queries related to soft delete fields, the program will assume that the user needs to have full control of the data and will not automatically inject soft delete filtering conditions



# Quick Start

## Install

```
$ npm install soft-delete-mongoose-plugin
```



## Usage

### Typescript

Use of the **SoftDeleteModel** type, instead of the Model type.

```typescript
import { set, Schema, model, connect } from 'mongoose';
import { SoftDelete, SoftDeleteModel } from 'soft-delete-mongoose-plugin';

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
```



### JavaScript

```javascript
const { connect, Schema, model } = require('mongoose');
const { SoftDelete } = require('soft-delete-mongoose-plugin');

// defind soft delete field name
const SOFT_DELETE_FIELD = 'deleteAt';
const studentSchema = new Schema({
    name: { type: String, required: true },
    [SOFT_DELETE_FIELD]: { type: Date, default: null }, // soft delete field type must be Date | null
});

studentSchema.plugin(new SoftDelete(SOFT_DELETE_FIELD).getPlugin());

const StudentModel = model('students', studentSchema);

// It's ready to use studentModel to soft delete documents
await StudentModel.softDeleteMany();
```



# API

## Class: SoftDelete

**Parameters：**

- *softDeleteField* **\<string\>**  Soft delete field name, type of Date | null

- *options* **\<Object\>**
​  *mongoDBVersion* **\<string\>**  Rewrite with better query statements based on the mongoDB version used, default the last MongoDB version
​  *override* **\<OverrideOptions\>** Sets whether the specified method needs to be overridden

*note:*

```typescript
type OverrideOptions = <Record<OverriddenMethod, boolean>>
```



**The program supports the rewriting of mongoose Model method as follows**：

```typescript
const overriddenMethods: OverriddenMethod[] = [
  'aggregate',
  'bulkWrite',
  'count',
  'countDocuments',
  'distinct',
  'exists',
  'find',
  'findById',
  'findByIdAndUpdate',
  'findOne',
  'findOneAndReplace',
  'findOneAndUpdate',
  'replaceOne',
  'update',
  'updateMany',
  'updateOne',
]
```



**Example usage:**

```typescript
new SoftDelete("softDeleteField", {
  mongoDBVersion: "5.0.5",
  override: { aggregate: false }, // not override aggregate method
});
```



## Method: softDelete.getPlugin

**return** <Function>  the mongoose plugin function



# Soft delete methods

Add independent soft delete methods to the mongoose model, the soft delete method actually calls the corresponding mongoose model update method：

| soft delete method    | update method     |
| --------------------- | ----------------- |
| softDeleteOne         | updateOne         |
| softDeleteMany        | updateMany        |
| findByIdAndSoftDelete | findByIdAndUpdate |

The function takes the same parameters as the corresponding update method, except that the update options parameter is not passed.

