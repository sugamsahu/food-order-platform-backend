export default (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.ENUM('admin', 'operator'), allowNull: false, defaultValue: 'operator' },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    // Embedded in every token; bumped on logout and password reset so older tokens stop working.
    tokenVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
  }, { tableName: 'users', underscored: true, timestamps: true })
  return User
}
