import { DataTypes } from "sequelize";
import db from "../config/database.ts";

const User = db.define(
  "User",
  {
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    password: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    cpf: {
      type: DataTypes.STRING(11),
      allowNull: false,
    },
    phone: {
      type: DataTypes.TEXT,
    },
    is_subscriber: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    wallet_balance: {
      type: DataTypes.FLOAT,
      defaultValue: 0.0,
    },
  },
  {
    tableName: "users",
    timestamps: false,
  },
);

export default User;
