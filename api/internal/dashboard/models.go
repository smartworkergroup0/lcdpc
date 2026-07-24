package dashboard

type OrdersByStatusItem struct {
	Status       string  `json:"status"`
	Count        int     `json:"count"`
	TotalRevenue float64 `json:"total_revenue"`
}

type SalesTrendItem struct {
	Date    string  `json:"date"`
	Count   int     `json:"count"`
	Revenue float64 `json:"revenue"`
}

type TopItem struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	TotalQuantity int     `json:"total_quantity"`
	TotalRevenue  float64 `json:"total_revenue"`
}

type StockHealth struct {
	OutOfStock int           `json:"out_of_stock"`
	LowStock   int           `json:"low_stock"`
	Healthy    int           `json:"healthy"`
	Items      []LowStockItem `json:"items"`
}

type SummaryData struct {
	TotalProducts int `json:"total_products"`
	TotalBundles  int `json:"total_bundles"`
	TotalOrders   int `json:"total_orders"`
	PendingOrders int `json:"pending_orders"`
}

type LowStockItem struct {
	ProductID      string  `json:"product_id"`
	Name           string  `json:"name"`
	SKU            string  `json:"sku"`
	StockAvailable int     `json:"stock_available"`
	Stock          int     `json:"stock"`
	BranchID       string  `json:"branch_id"`
	BaseUnitID     *string `json:"base_unit_id"`
}

// Operations panel models

type TodayActivity struct {
	OrdersCreatedToday    int     `json:"orders_created_today"`
	OrdersCompletedToday int     `json:"orders_completed_today"`
	PendingOrders        int     `json:"pending_orders"`
	RevenueToday          float64 `json:"revenue_today"`
}

type AttentionStatusItem struct {
	Status string `json:"status"`
	Count  int    `json:"count"`
}

type RecentOrderItem struct {
	DisplayID      string  `json:"display_id"`
	Status        string  `json:"status"`
	PriceTotal    float64 `json:"price_total"`
	TotalItems    int     `json:"total_items"`
	CreatedAt     string  `json:"created_at"`
	CustomerName  string  `json:"customer_name"`
}
