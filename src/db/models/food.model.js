export default (sequelize, DataTypes) => {
  const Food = sequelize.define('Food', {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    category: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'Uncategorized' },
    price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'AED' },
    imageUrl: { type: DataTypes.TEXT, allowNull: true },
    isAvailable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    // Soft deletion: archived foods are hidden and cannot be ordered, but order history keeps them.
    archivedAt: { type: DataTypes.DATE, allowNull: true }
  }, { tableName: 'foods', underscored: true, timestamps: true })

  Food.associate = (models) => {
    Food.hasMany(models.OrderItem, { foreignKey: 'foodId', as: 'orderItems' })
  }
  return Food
}
