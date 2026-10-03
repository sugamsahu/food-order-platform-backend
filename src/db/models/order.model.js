export default (sequelize, DataTypes) => {
  const Order = sequelize.define('Order', {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    reference: { type: DataTypes.STRING(20), allowNull: false, unique: true },
    customerId: { type: DataTypes.BIGINT, allowNull: false },
    status: {
      type: DataTypes.ENUM('Placed', 'Accepted', 'Preparing', 'Ready', 'Completed', 'Cancelled'),
      allowNull: false,
      defaultValue: 'Placed'
    },
    fulfillmentType: { type: DataTypes.ENUM('pickup', 'delivery'), allowNull: false, defaultValue: 'pickup' },
    deliveryAddress: { type: DataTypes.TEXT, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    subtotal: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    total: { type: DataTypes.DECIMAL(10, 2), allowNull: false }
  }, { tableName: 'orders', underscored: true, timestamps: true })

  Order.associate = (models) => {
    Order.belongsTo(models.Customer, { foreignKey: 'customerId', as: 'customer' })
    Order.hasMany(models.OrderItem, { foreignKey: 'orderId', as: 'items' })
    Order.hasMany(models.OrderStatusHistory, { foreignKey: 'orderId', as: 'statusHistory' })
  }
  return Order
}
