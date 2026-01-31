import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { Express, Request, Response } from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "TableMitra API Documentation",
            version: "1.0.0",
            description: "API documentation for TableMitra Hotel Management System",
        },
        servers: [
            {
                url: process.env.BASE_URL || "http://localhost:5000",
                description: "Development server",
            },
        ],
        tags: [
            { name: "Auth", description: "Authentication endpoints" },
            { name: "Admin - Roles", description: "Role management (requires MANAGE_ROLES permission)" },
            { name: "Admin - Permissions", description: "Permission management (requires MANAGE_PERMISSIONS permission)" },
            { name: "Company - Admins", description: "Admin profile management (requires MANAGE_ADMINS permission)" },
            { name: "Company - Customer Care", description: "Customer care profile management (requires MANAGE_CUSTOMER_CARE permission)" },
            { name: "Company - Sales", description: "Sales profile management (requires MANAGE_SALES permission)" },
            { name: "Hospitality - Chains", description: "Chain management (Sales: onboard, Admin/Founder: view)" },
            { name: "Hospitality - Chain Members", description: "Chain member management (Founder only)" },
            { name: "Hospitality - Hotels", description: "Hotel management (Sales/Founder: onboard, all: view)" },
            { name: "Hospitality - Staff", description: "Hotel staff management (Sales/Founder/Manager: onboard)" },
            { name: "QR Codes", description: "QR Code and QR Set management (auto-created on hotel onboard)" },
            { name: "Menu - Categories", description: "Menu category management (FrontDesk/Kitchen staff)" },
            { name: "Menu - Items", description: "Menu item management with variants (FrontDesk/Kitchen staff)" },
            { name: "Menu - Variants", description: "Item variant retrieval (FrontDesk/Kitchen staff)" },
            { name: "Menu - Full Menu", description: "Full menu with nested structure (FrontDesk/Kitchen staff)" },
            { name: "Service - Categories", description: "Service category management (Manager/FrontDesk/RoomService)" },
            { name: "Service - Services", description: "Individual service management (Manager/FrontDesk/RoomService)" },
            { name: "Service - Full Catalog", description: "Full service catalog with nested structure" },
        ],
        components: {
            schemas: {
                Error: {
                    type: "object",
                    properties: {
                        success: { type: "boolean", example: false },
                        message: { type: "string", example: "Error message" },
                    },
                },
                Success: {
                    type: "object",
                    properties: {
                        success: { type: "boolean", example: true },
                        message: { type: "string", example: "Operation successful" },
                    },
                },
                Pagination: {
                    type: "object",
                    properties: {
                        total: { type: "integer", example: 100 },
                        page: { type: "integer", example: 1 },
                        limit: { type: "integer", example: 20 },
                        totalPages: { type: "integer", example: 5 },
                    },
                },
            },
            securitySchemes: {
                BearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                    description: "Enter your access token (use this for testing in Swagger UI)",
                },
                CookieAuth: {
                    type: "apiKey",
                    in: "cookie",
                    name: "{app}_accessToken",
                    description: "JWT token stored in app-specific cookie (e.g., admin_accessToken)",
                },
            },
        },
    },
    apis: [join(__dirname, "*.yml"), join(__dirname, "*.yaml")],
};

const swaggerSpec = swaggerJsdoc(options);

export const swaggerDocs = (app: Express): void => {
    app.use(
        "/docs",
        swaggerUi.serve,
        swaggerUi.setup(swaggerSpec, {
            swaggerOptions: {
                persistAuthorization: true,
            },
            customSiteTitle: "TableMitra API Docs",
            customCss: ".swagger-ui .topbar { display: none }",
        })
    );

    app.get("/docs.json", (req: Request, res: Response) => {
        res.setHeader("Content-Type", "application/json");
        res.send(swaggerSpec);
    });

    console.log(`📚 Swagger docs available at /docs`);
};
