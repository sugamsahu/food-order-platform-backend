'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Add actor_type and reason to order_status_history
    await queryInterface.addColumn('order_status_history', 'actor_type', {
      type: Sequelize.ENUM('staff', 'customer', 'system'),
      allowNull: false,
      defaultValue: 'staff'
    });
    
    await queryInterface.addColumn('order_status_history', 'reason', {
      type: Sequelize.STRING,
      allowNull: true
    });

    // 2. Add required database indexes
    await queryInterface.addIndex('orders', ['id'], { name: 'orders_id_idx' });
    await queryInterface.addIndex('orders', ['customer_id'], { name: 'orders_customer_id_idx' });
    await queryInterface.addIndex('orders', ['status', 'created_at'], { name: 'orders_status_created_at_idx' });
    
    // We also could add a GIN index on food name or just a regular B-tree index
    await queryInterface.addIndex('foods', ['name'], { name: 'foods_name_idx' });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('foods', 'foods_name_idx');
    await queryInterface.removeIndex('orders', 'orders_status_created_at_idx');
    await queryInterface.removeIndex('orders', 'orders_customer_id_idx');
    await queryInterface.removeIndex('orders', 'orders_id_idx');

    await queryInterface.removeColumn('order_status_history', 'reason');
    await queryInterface.removeColumn('order_status_history', 'actor_type');
    
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_order_status_history_actor_type";');
  }
};
