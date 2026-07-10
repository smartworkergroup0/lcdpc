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

var allowedTransitions = map[string][]string{
	StatusPendingReview:          {StatusUnderReview, StatusRejectedByValidation, StatusCancelledByCustomer},
	StatusUnderReview:            {StatusApprovedForFulfillment, StatusRejectedByValidation, StatusCancelledByCustomer},
	StatusApprovedForFulfillment: {StatusInPreparation, StatusCancelledByCustomer},
	StatusInPreparation:          {StatusAwaitingInventory, StatusPreparationCompleted, StatusCancelledByCustomer},
	StatusAwaitingInventory:      {StatusInPreparation, StatusCancelledByCustomer},
	StatusPreparationCompleted:   {StatusReadyForPickup, StatusReadyForDispatch},
	StatusReadyForPickup:         {StatusPickedUp, StatusDeliveryFailed},
	StatusReadyForDispatch:       {StatusInTransit, StatusDeliveryFailed},
	StatusInTransit:              {StatusDelivered, StatusDeliveryFailed},
	StatusDelivered:              {StatusCompleted},
	StatusPickedUp:               {StatusCompleted},
}

var terminalStatuses = map[string]bool{
	StatusRejectedByValidation: true,
	StatusDeliveryFailed:       true,
	StatusCompleted:            true,
	StatusCancelledByCustomer:  true,
}

var editableStatuses = map[string]bool{
	StatusPendingReview: true,
	StatusUnderReview:   true,
}

func IsTransitionAllowed(from, to string) bool {
	targets, ok := allowedTransitions[from]
	if !ok {
		return false
	}
	for _, t := range targets {
		if t == to {
			return true
		}
	}
	return false
}

func IsTerminal(status string) bool {
	return terminalStatuses[status]
}

func IsEditable(status string) bool {
	return editableStatuses[status]
}

func IsValidStatus(status string) bool {
	_, ok := allowedTransitions[status]
	if ok {
		return true
	}
	return terminalStatuses[status]
}
