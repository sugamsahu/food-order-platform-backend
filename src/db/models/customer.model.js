export default (sequelize, DataTypes) => {
  const Customer = sequelize.define('Customer', {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING, allowNull: false },
    phone: { type: DataTypes.STRING, allowNull: true }
  }, { tableName: 'customers', underscored: true, timestamps: true })

  Customer.associate = (models) => {
    Customer.hasMany(models.Order, { foreignKey: 'customerId', as: 'orders' })
  }
  return Customer
}
