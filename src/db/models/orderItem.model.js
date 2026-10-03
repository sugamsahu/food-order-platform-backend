export default (sequelize, DataTypes) => {
  const OrderItem = sequelize.define('OrderItem', {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    orderId: { type: DataTypes.BIGINT, allowNull: false },
    foodId: { type: DataTypes.BIGINT, allowNull: false },
    foodNameSnapshot: { type: DataTypes.STRING, allowNull: false },
    unitPriceSnapshot: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: false },
    lineTotal: { type: DataTypes.DECIMAL(10, 2), allowNull: false }
  }, { tableName: 'order_items', underscored: true, timestamps: true })

  OrderItem.associate = (models) => {
    OrderItem.belongsTo(models.Order, { foreignKey: 'orderId', as: 'order' })
    OrderItem.belongsTo(models.Food, { foreignKey: 'foodId', as: 'food' })
  }
  return OrderItem
}
