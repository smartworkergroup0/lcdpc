package order

const (
	StatusPendingReview           = "PENDING_REVIEW"
	StatusUnderReview             = "UNDER_REVIEW"
	StatusApprovedForFulfillment  = "APPROVED_FOR_FULFILLMENT"
	StatusRejectedByValidation    = "REJECTED_BY_VALIDATION"
	StatusInPreparation           = "IN_PREPARATION"
	StatusAwaitingInventory       = "AWAITING_INVENTORY"
	StatusPreparationCompleted    = "PREPARATION_COMPLETED"
	StatusReadyForPickup          = "READY_FOR_PICKUP"
	StatusReadyForDispatch        = "READY_FOR_DISPATCH"
	StatusInTransit               = "IN_TRANSIT"
	StatusDelivered               = "DELIVERED"
	StatusPickedUp                = "PICKED_UP"
	StatusDeliveryFailed          = "DELIVERY_FAILED"
	StatusCompleted               = "COMPLETED"
	StatusCancelledByCustomer     = "CANCELLED_BY_CUSTOMER"
)

var editableStatuses = map[string]bool{
	StatusPendingReview: true,
	StatusUnderReview:   true,
}

func IsEditable(status string) bool {
	return editableStatuses[status]
}
