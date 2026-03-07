
export const permissions = [

    // customer 
    { key: "UPDATE_CUSTOMER_PROFILE", description: "Update customer profile" },

    // ADMIN 
    { key: "MANAGE_ADMINS", description: "Manage admin profiles" },
    { key: "MANAGE_CUSTOMER_CARE", description: "Manage customer care profiles" },
    { key: "MANAGE_SALES", description: "Manage sales profiles" },
    { key: "MANAGE_ROLES", description: "Manage roles" },
    { key: "MANAGE_PERMISSIONS", description: "Manage permissions" },


    // HTOEL LEVEL 
    { key: "ONBOARD_HOTEL", description: "Onboard a new hotel into the platform" },
    { key: "VIEW_HOTEL", description: "View hotel details" },
    { key: "VIEW_CHAIN", description: "View chain details" },
    { key: "SWITCH_CHAIN", description: "Switch chain context" },
    { key: "CREATE_CHAIN", description: "Create a new chain" },
    { key: "ADD_CHAIN_MEMBER", description: "Add co-owner/director to chain" },
    { key: "VIEW_CHAIN_MEMBERS", description: "View chain members" },
    { key: "CREATE_STAFF", description: "Create staff" },
    { key: "VIEW_STAFF", description: "View staff" },
    { key: "CHECK_IN_GUEST", description: "Check in a guest" },


    //menu
    { key: "VIEW_MENU", description: "View menu" },
    { key: "CREATE_MENU", description: "Create menu" },
    { key: "UPDATE_MENU", description: "Update menu" },
    { key: "DELETE_MENU", description: "Delete menu" }, 

    // service
    { key: "VIEW_SERVICE", description: "View services" },
    { key: "CREATE_SERVICE", description: "Create service" },
    { key: "UPDATE_SERVICE", description: "Update service" },
    { key: "DELETE_SERVICE", description: "Delete service" },


    // food order
    { key: "CREATE_FOOD_ORDER", description: "Create a food order" },
    { key: "VIEW_FOOD_ORDER", description: "View food orders" },
    { key: "UPDATE_FOOD_ORDER_STATUS", description: "Update food order status" },
    { key: "EDIT_FOOD_ORDER", description: "Edit a food order" },


    // service request
    { key: "CREATE_SERVICE_REQUEST", description: "Create a service request" },
    { key: "VIEW_SERVICE_REQUEST", description: "View service requests" },
    { key: "UPDATE_SERVICE_REQUEST_STATUS", description: "Update service request status" },
    { key: "EDIT_SERVICE_REQUEST", description: "Edit a service request" }, 



    // qr code
    { key: "VIEW_QR", description: "View QR codes" },
    { key: "CREATE_QR", description: "Create QR codes" },
    { key: "UPDATE_QR", description: "Update QR codes" },
    { key: "DELETE_QR", description: "Delete QR codes" }, 



    // reports
    { key: "VIEW_GLOBAL_REPORTS", description: "View global reports" },
    { key: "EXPORT_GLOBAL_REPORTS", description: "Export global reports" },
    { key: "VIEW_CHAIN_REPORTS", description: "View chain reports" },
    { key: "EXPORT_CHAIN_REPORTS", description: "Export chain reports" },
    { key: "VIEW_HOTEL_REPORTS", description: "View hotel reports" },
    { key: "EXPORT_HOTEL_REPORTS", description: "Export hotel reports" },



    // attachments
    { key: "CREATE_ATTACHMENT", description: "Create attachments" },
    { key: "VIEW_ATTACHMENT", description: "View attachments" },
    { key: "UPDATE_ATTACHMENT", description: "Update attachments" },
    { key: "DELETE_ATTACHMENT", description: "Delete attachments" },

]