const STATUSES = ['Placed', 'Accepted', 'Preparing', 'Ready', 'Completed', 'Cancelled']

// Append-only: a database trigger rejects UPDATE and DELETE on this table.
export default (sequelize, DataTypes) => {
  const OrderStatusHistory = sequelize.define('OrderStatusHistory', {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    orderId: { type: DataTypes.BIGINT, allowNull: false },
    fromStatus: { type: DataTypes.ENUM(...STATUSES), allowNull: true },
    toStatus: { type: DataTypes.ENUM(...STATUSES), allowNull: false },
    actorType: { type: DataTypes.ENUM('staff', 'customer', 'system'), allowNull: false, defaultValue: 'staff' },
    actorId: { type: DataTypes.BIGINT, allowNull: true },
    reason: { type: DataTypes.STRING, allowNull: true }
  }, { tableName: 'order_status_history', underscored: true, timestamps: true, updatedAt: false })

  OrderStatusHistory.associate = (models) => {
    OrderStatusHistory.belongsTo(models.Order, { foreignKey: 'orderId', as: 'order' })
  }
  return OrderStatusHistory
}
