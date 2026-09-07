-- CreateEnum
CREATE TYPE "ValuationMethod" AS ENUM ('WEIGHTED_AVERAGE', 'FIFO');

-- CreateEnum
CREATE TYPE "ZatcaEnvironment" AS ENUM ('SANDBOX', 'SIMULATION', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INVITED');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "FiscalPeriodStatus" AS ENUM ('OPEN', 'CLOSED', 'LOCKED');

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "BankMatchStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'IGNORED');

-- CreateEnum
CREATE TYPE "ItemKind" AS ENUM ('STOCK', 'SERVICE', 'BUNDLE', 'RAW_MATERIAL', 'FINISHED_GOOD');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'POSTED', 'PARTIALLY_SETTLED', 'SETTLED', 'CANCELLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('STANDARD', 'SIMPLIFIED');

-- CreateEnum
CREATE TYPE "InvoiceDocumentType" AS ENUM ('TAX_INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE');

-- CreateEnum
CREATE TYPE "ZatcaSubmissionStatus" AS ENUM ('PENDING', 'CLEARED', 'REPORTED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentDirection" AS ENUM ('RECEIPT', 'PAYMENT');

-- CreateEnum
CREATE TYPE "PosSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'TERMINATED');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "legalNameEn" TEXT NOT NULL,
    "legalNameAr" TEXT NOT NULL,
    "tradeNameEn" TEXT,
    "tradeNameAr" TEXT,
    "crNumber" TEXT,
    "vatNumber" TEXT,
    "vatRegistered" BOOLEAN NOT NULL DEFAULT true,
    "vatRate" DECIMAL(6,4) NOT NULL DEFAULT 0.15,
    "baseCurrency" TEXT NOT NULL DEFAULT 'SAR',
    "fiscalYearStart" INTEGER NOT NULL DEFAULT 1,
    "valuationMethod" "ValuationMethod" NOT NULL DEFAULT 'WEIGHTED_AVERAGE',
    "valuationLocked" BOOLEAN NOT NULL DEFAULT false,
    "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false,
    "roundingIncrement" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "posEnabled" BOOLEAN NOT NULL DEFAULT false,
    "logoUrl" TEXT,
    "defaultLocale" TEXT NOT NULL DEFAULT 'ar',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Riyadh',
    "molEstablishmentId" TEXT,
    "zatcaEnvironment" "ZatcaEnvironment" NOT NULL DEFAULT 'SANDBOX',
    "payrollSettings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "isCostCentre" BOOLEAN NOT NULL DEFAULT true,
    "addressId" UUID,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" UUID,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "buildingNumber" TEXT,
    "street" TEXT,
    "district" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "additionalNumber" TEXT,
    "region" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'SA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT,
    "role" TEXT NOT NULL,
    "branchIds" UUID[],
    "extraPermissions" TEXT[],
    "revokedPermissions" TEXT[],
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "refreshHash" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequences" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "kind" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "resetYearly" BOOLEAN NOT NULL DEFAULT true,
    "padding" INTEGER NOT NULL DEFAULT 6,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "year" INTEGER NOT NULL,
    "gapFree" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID,
    "entity" TEXT NOT NULL,
    "entityId" UUID,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "parentId" UUID,
    "postable" BOOLEAN NOT NULL DEFAULT true,
    "role" TEXT,
    "currency" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" UUID,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_periods" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "status" "FiscalPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "periodId" UUID,
    "source" TEXT NOT NULL,
    "sourceId" UUID,
    "reference" TEXT,
    "memoEn" TEXT,
    "memoAr" TEXT,
    "currencyCode" TEXT NOT NULL DEFAULT 'SAR',
    "exchangeRate" DECIMAL(18,8) NOT NULL DEFAULT 1,
    "status" "JournalStatus" NOT NULL DEFAULT 'POSTED',
    "totalDebit" DECIMAL(18,4) NOT NULL,
    "totalCredit" DECIMAL(18,4) NOT NULL,
    "reversedById" UUID,
    "recurringId" UUID,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "accountId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "debit" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "currencyAmount" DECIMAL(18,4),
    "partyId" UUID,
    "itemId" UUID,
    "employeeId" UUID,
    "memoEn" TEXT,
    "memoAr" TEXT,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currencies" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "symbol" TEXT,
    "decimals" INTEGER NOT NULL DEFAULT 2,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "currencyId" UUID NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "validFrom" DATE NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "bankName" TEXT,
    "iban" TEXT,
    "currencyCode" TEXT NOT NULL DEFAULT 'SAR',
    "openingBalance" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "bankAccountId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "debit" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "balance" DECIMAL(18,4),
    "status" "BankMatchStatus" NOT NULL DEFAULT 'UNMATCHED',
    "matchedLineId" UUID,
    "importHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parties" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "isCustomer" BOOLEAN NOT NULL DEFAULT false,
    "isSupplier" BOOLEAN NOT NULL DEFAULT false,
    "vatNumber" TEXT,
    "crNumber" TEXT,
    "identityScheme" TEXT,
    "identityValue" TEXT,
    "addressId" UUID,
    "email" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "paymentTermDays" INTEGER NOT NULL DEFAULT 0,
    "creditLimit" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "priceListId" UUID,
    "openingBalance" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "party_contacts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "partyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "party_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_categories" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "parentId" UUID,

    CONSTRAINT "item_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units_of_measure" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "uneceCode" TEXT NOT NULL DEFAULT 'PCE',
    "factor" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "baseUnitId" UUID,

    CONSTRAINT "units_of_measure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "descriptionEn" TEXT,
    "descriptionAr" TEXT,
    "kind" "ItemKind" NOT NULL DEFAULT 'STOCK',
    "categoryId" UUID,
    "uomId" UUID NOT NULL,
    "sellingPrice" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "priceIncludesVat" BOOLEAN NOT NULL DEFAULT false,
    "vatCategory" TEXT NOT NULL DEFAULT 'STANDARD',
    "lastCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "reorderLevel" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "trackLots" BOOLEAN NOT NULL DEFAULT false,
    "trackExpiry" BOOLEAN NOT NULL DEFAULT false,
    "imageUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_lists" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'SAR',
    "includesVat" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "priceListId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "price" DECIMAL(18,4) NOT NULL,
    "minQuantity" DECIMAL(18,6) NOT NULL DEFAULT 0,

    CONSTRAINT "price_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL,
    "costAmount" DECIMAL(18,4) NOT NULL,
    "layerRemaining" DECIMAL(18,6),
    "lotCode" TEXT,
    "expiresOn" DATE,
    "source" TEXT NOT NULL,
    "sourceId" UUID,
    "reference" TEXT,
    "entryId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balances" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "value" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_counts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "entryId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_lines" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "stockCountId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "systemQuantity" DECIMAL(18,6) NOT NULL,
    "countedQuantity" DECIMAL(18,6) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "stock_count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bills_of_materials" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "outputQuantity" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bills_of_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_lines" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "bomId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "quantityPer" DECIMAL(18,6) NOT NULL,
    "wastageRate" DECIMAL(6,4) NOT NULL DEFAULT 0,

    CONSTRAINT "bom_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_orders" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "bomId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "componentsCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "outputValue" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "entryId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotations" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "partyId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "validUntil" DATE,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_orders" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "partyId" UUID NOT NULL,
    "quotationId" UUID,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_notes" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "partyId" UUID NOT NULL,
    "salesOrderId" UUID,
    "warehouseId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "delivery_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "partyId" UUID,
    "salesOrderId" UUID,
    "number" TEXT,
    "uuid" UUID NOT NULL,
    "kind" "InvoiceKind" NOT NULL DEFAULT 'STANDARD',
    "documentType" "InvoiceDocumentType" NOT NULL DEFAULT 'TAX_INVOICE',
    "originalInvoiceId" UUID,
    "correctionReason" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "date" DATE NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "dueDate" DATE,
    "supplyDate" DATE,
    "currencyCode" TEXT NOT NULL DEFAULT 'SAR',
    "exchangeRate" DECIMAL(18,8) NOT NULL DEFAULT 1,
    "isExport" BOOLEAN NOT NULL DEFAULT false,
    "taxableTotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "vatTotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "roundingAdjustment" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "payableTotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "paidTotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "costOfSales" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "icv" INTEGER,
    "pih" TEXT,
    "invoiceHash" TEXT,
    "qrBase64" TEXT,
    "signedXml" TEXT,
    "clearedXml" TEXT,
    "paymentMeansCode" TEXT,
    "notes" TEXT,
    "entryId" UUID,
    "posSaleId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "itemId" UUID,
    "descriptionEn" TEXT NOT NULL,
    "descriptionAr" TEXT,
    "unitCode" TEXT NOT NULL DEFAULT 'PCE',
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "discount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "vatCategory" TEXT NOT NULL DEFAULT 'STANDARD',
    "vatRate" DECIMAL(6,4) NOT NULL DEFAULT 0.15,
    "taxableAmount" DECIMAL(18,4) NOT NULL,
    "vatAmount" DECIMAL(18,4) NOT NULL,
    "lineTotal" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "warehouseId" UUID,
    "modifiers" JSONB,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zatca_submissions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "mode" TEXT NOT NULL,
    "status" "ZatcaSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "httpStatus" INTEGER,
    "responseBody" JSONB,
    "warnings" JSONB,
    "errors" JSONB,
    "submittedAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zatca_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zatca_certificates" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "environment" "ZatcaEnvironment" NOT NULL DEFAULT 'SANDBOX',
    "egsSerial" TEXT NOT NULL,
    "commonName" TEXT NOT NULL,
    "invoiceType" TEXT NOT NULL DEFAULT '1100',
    "privateKeyEnc" TEXT NOT NULL,
    "csrPem" TEXT,
    "complianceCertEnc" TEXT,
    "complianceSecretEnc" TEXT,
    "productionCertEnc" TEXT,
    "productionSecretEnc" TEXT,
    "complianceRequestId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "lastInvoiceHash" TEXT,
    "lastIcv" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zatca_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "partyId" UUID,
    "number" TEXT NOT NULL,
    "direction" "PaymentDirection" NOT NULL,
    "date" DATE NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "bankCharges" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'SAR',
    "exchangeRate" DECIMAL(18,8) NOT NULL DEFAULT 1,
    "bankAccountId" UUID,
    "reference" TEXT,
    "notes" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'POSTED',
    "entryId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "invoiceId" UUID,
    "billId" UUID,
    "amount" DECIMAL(18,4) NOT NULL,
    "baseAmount" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "partyId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "expectedDate" DATE,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "currencyCode" TEXT NOT NULL DEFAULT 'SAR',
    "totalAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "purchaseOrderId" UUID,
    "warehouseId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "landedCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "landedCostBasis" TEXT NOT NULL DEFAULT 'VALUE',
    "entryId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_bills" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "partyId" UUID NOT NULL,
    "goodsReceiptId" UUID,
    "number" TEXT NOT NULL,
    "supplierInvoiceNumber" TEXT,
    "date" DATE NOT NULL,
    "dueDate" DATE,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "currencyCode" TEXT NOT NULL DEFAULT 'SAR',
    "exchangeRate" DECIMAL(18,8) NOT NULL DEFAULT 1,
    "taxableTotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "vatTotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "withholdingTax" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "payableTotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "paidTotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "isImport" BOOLEAN NOT NULL DEFAULT false,
    "reverseCharge" BOOLEAN NOT NULL DEFAULT false,
    "entryId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "supplier_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_bill_lines" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "billId" UUID NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "itemId" UUID,
    "accountId" UUID,
    "descriptionEn" TEXT NOT NULL,
    "descriptionAr" TEXT,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "discount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "vatCategory" TEXT NOT NULL DEFAULT 'STANDARD',
    "vatRate" DECIMAL(6,4) NOT NULL DEFAULT 0.15,
    "taxableAmount" DECIMAL(18,4) NOT NULL,
    "vatAmount" DECIMAL(18,4) NOT NULL,
    "warehouseId" UUID,

    CONSTRAINT "supplier_bill_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debit_notes" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "billId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "taxableTotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "vatTotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "entryId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "debit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "partyId" UUID,
    "employeeId" UUID,
    "accountId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "vatAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "vatCategory" TEXT NOT NULL DEFAULT 'STANDARD',
    "paymentMethod" TEXT NOT NULL DEFAULT 'CASH',
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "reimbursed" BOOLEAN NOT NULL DEFAULT false,
    "entryId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_sessions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "terminalCode" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "status" "PosSessionStatus" NOT NULL DEFAULT 'OPEN',
    "openingFloat" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "expectedCash" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "countedCash" DECIMAL(18,4),
    "variance" DECIMAL(18,4),
    "entryId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_sales" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL,
    "tableCode" TEXT,
    "coverCount" INTEGER,
    "tipAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "tenders" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conflictNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "employeeNumber" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "identityNumber" TEXT NOT NULL,
    "nationality" TEXT NOT NULL,
    "isSaudi" BOOLEAN NOT NULL DEFAULT false,
    "jobTitleEn" TEXT,
    "jobTitleAr" TEXT,
    "department" TEXT,
    "hireDate" DATE NOT NULL,
    "contractType" TEXT NOT NULL DEFAULT 'UNLIMITED',
    "basicSalary" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "housingAllowance" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "transportAllowance" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "otherAllowance" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "iban" TEXT,
    "gosiExempt" BOOLEAN NOT NULL DEFAULT false,
    "eosbAccrued" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "iqamaExpiry" DATE,
    "passportExpiry" DATE,
    "contractExpiry" DATE,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "terminationDate" DATE,
    "terminationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "hoursWorked" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "overtimeHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PRESENT',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "leaveType" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "days" DECIMAL(6,2) NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "status" "LeaveStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "ratesUsed" JSONB NOT NULL,
    "totalGross" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalNet" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalGosiEmployee" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalGosiEmployer" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalEosbAccrual" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "entryId" UUID,
    "wpsFileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "payrollRunId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "earnings" JSONB NOT NULL,
    "deductions" JSONB NOT NULL,
    "grossPay" DECIMAL(18,4) NOT NULL,
    "totalDeductions" DECIMAL(18,4) NOT NULL,
    "netPay" DECIMAL(18,4) NOT NULL,
    "gosiEmployee" DECIMAL(18,4) NOT NULL,
    "gosiEmployer" DECIMAL(18,4) NOT NULL,
    "eosbAccrual" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loans" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "principal" DECIMAL(18,4) NOT NULL,
    "instalment" DECIMAL(18,4) NOT NULL,
    "outstanding" DECIMAL(18,4) NOT NULL,
    "startsOn" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "entryId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID,
    "kind" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "bodyEn" TEXT,
    "bodyAr" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT[],
    "secretEnc" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "webhookId" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "httpStatus" INTEGER,
    "responseBody" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "permissions" TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "branches_tenantId_idx" ON "branches"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "branches_tenantId_code_key" ON "branches"("tenantId", "code");

-- CreateIndex
CREATE INDEX "addresses_tenantId_idx" ON "addresses"("tenantId");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refreshHash_key" ON "sessions"("refreshHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sequences_tenantId_idx" ON "sequences"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "sequences_tenantId_branchId_kind_key" ON "sequences"("tenantId", "branchId", "kind");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_entity_entityId_idx" ON "audit_logs"("tenantId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "accounts_tenantId_idx" ON "accounts"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_tenantId_code_key" ON "accounts"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_tenantId_role_key" ON "accounts"("tenantId", "role");

-- CreateIndex
CREATE INDEX "fiscal_periods_tenantId_startsOn_endsOn_idx" ON "fiscal_periods"("tenantId", "startsOn", "endsOn");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_periods_tenantId_startsOn_key" ON "fiscal_periods"("tenantId", "startsOn");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_reversedById_key" ON "journal_entries"("reversedById");

-- CreateIndex
CREATE INDEX "journal_entries_tenantId_date_idx" ON "journal_entries"("tenantId", "date");

-- CreateIndex
CREATE INDEX "journal_entries_tenantId_source_sourceId_idx" ON "journal_entries"("tenantId", "source", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_tenantId_number_key" ON "journal_entries"("tenantId", "number");

-- CreateIndex
CREATE INDEX "journal_lines_tenantId_accountId_idx" ON "journal_lines"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "journal_lines_tenantId_partyId_idx" ON "journal_lines"("tenantId", "partyId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_lines_entryId_lineNo_key" ON "journal_lines"("entryId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "currencies_tenantId_code_key" ON "currencies"("tenantId", "code");

-- CreateIndex
CREATE INDEX "exchange_rates_tenantId_idx" ON "exchange_rates"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_currencyId_validFrom_key" ON "exchange_rates"("currencyId", "validFrom");

-- CreateIndex
CREATE INDEX "bank_accounts_tenantId_idx" ON "bank_accounts"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_matchedLineId_key" ON "bank_transactions"("matchedLineId");

-- CreateIndex
CREATE INDEX "bank_transactions_tenantId_date_idx" ON "bank_transactions"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_bankAccountId_importHash_key" ON "bank_transactions"("bankAccountId", "importHash");

-- CreateIndex
CREATE INDEX "parties_tenantId_isCustomer_idx" ON "parties"("tenantId", "isCustomer");

-- CreateIndex
CREATE INDEX "parties_tenantId_isSupplier_idx" ON "parties"("tenantId", "isSupplier");

-- CreateIndex
CREATE UNIQUE INDEX "parties_tenantId_code_key" ON "parties"("tenantId", "code");

-- CreateIndex
CREATE INDEX "party_contacts_tenantId_partyId_idx" ON "party_contacts"("tenantId", "partyId");

-- CreateIndex
CREATE UNIQUE INDEX "item_categories_tenantId_nameEn_key" ON "item_categories"("tenantId", "nameEn");

-- CreateIndex
CREATE UNIQUE INDEX "units_of_measure_tenantId_code_key" ON "units_of_measure"("tenantId", "code");

-- CreateIndex
CREATE INDEX "items_tenantId_barcode_idx" ON "items"("tenantId", "barcode");

-- CreateIndex
CREATE INDEX "items_tenantId_active_idx" ON "items"("tenantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "items_tenantId_sku_key" ON "items"("tenantId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "price_lists_tenantId_nameEn_key" ON "price_lists"("tenantId", "nameEn");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_items_priceListId_itemId_minQuantity_key" ON "price_list_items"("priceListId", "itemId", "minQuantity");

-- CreateIndex
CREATE INDEX "warehouses_tenantId_branchId_idx" ON "warehouses"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_tenantId_code_key" ON "warehouses"("tenantId", "code");

-- CreateIndex
CREATE INDEX "stock_movements_tenantId_itemId_warehouseId_date_idx" ON "stock_movements"("tenantId", "itemId", "warehouseId", "date");

-- CreateIndex
CREATE INDEX "stock_movements_tenantId_source_sourceId_idx" ON "stock_movements"("tenantId", "source", "sourceId");

-- CreateIndex
CREATE INDEX "stock_balances_tenantId_idx" ON "stock_balances"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_balances_itemId_warehouseId_key" ON "stock_balances"("itemId", "warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_counts_tenantId_number_key" ON "stock_counts"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "stock_count_lines_stockCountId_itemId_key" ON "stock_count_lines"("stockCountId", "itemId");

-- CreateIndex
CREATE INDEX "bills_of_materials_tenantId_itemId_idx" ON "bills_of_materials"("tenantId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "bom_lines_bomId_itemId_key" ON "bom_lines"("bomId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "production_orders_tenantId_number_key" ON "production_orders"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_tenantId_number_key" ON "quotations"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_tenantId_number_key" ON "sales_orders"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_notes_tenantId_number_key" ON "delivery_notes"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_uuid_key" ON "invoices"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_posSaleId_key" ON "invoices"("posSaleId");

-- CreateIndex
CREATE INDEX "invoices_tenantId_date_idx" ON "invoices"("tenantId", "date");

-- CreateIndex
CREATE INDEX "invoices_tenantId_status_idx" ON "invoices"("tenantId", "status");

-- CreateIndex
CREATE INDEX "invoices_tenantId_partyId_idx" ON "invoices"("tenantId", "partyId");

-- CreateIndex
CREATE INDEX "invoices_tenantId_icv_idx" ON "invoices"("tenantId", "icv");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenantId_number_key" ON "invoices"("tenantId", "number");

-- CreateIndex
CREATE INDEX "invoice_lines_tenantId_itemId_idx" ON "invoice_lines"("tenantId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lines_invoiceId_lineNo_key" ON "invoice_lines"("invoiceId", "lineNo");

-- CreateIndex
CREATE INDEX "zatca_submissions_tenantId_status_nextAttemptAt_idx" ON "zatca_submissions"("tenantId", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "zatca_submissions_invoiceId_idx" ON "zatca_submissions"("invoiceId");

-- CreateIndex
CREATE INDEX "zatca_certificates_tenantId_idx" ON "zatca_certificates"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "zatca_certificates_tenantId_environment_egsSerial_key" ON "zatca_certificates"("tenantId", "environment", "egsSerial");

-- CreateIndex
CREATE INDEX "payments_tenantId_date_idx" ON "payments"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenantId_number_key" ON "payments"("tenantId", "number");

-- CreateIndex
CREATE INDEX "payment_allocations_tenantId_invoiceId_idx" ON "payment_allocations"("tenantId", "invoiceId");

-- CreateIndex
CREATE INDEX "payment_allocations_tenantId_billId_idx" ON "payment_allocations"("tenantId", "billId");

-- CreateIndex
CREATE INDEX "purchase_orders_tenantId_status_idx" ON "purchase_orders"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_tenantId_number_key" ON "purchase_orders"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_tenantId_number_key" ON "goods_receipts"("tenantId", "number");

-- CreateIndex
CREATE INDEX "supplier_bills_tenantId_date_idx" ON "supplier_bills"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_bills_tenantId_number_key" ON "supplier_bills"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_bill_lines_billId_lineNo_key" ON "supplier_bill_lines"("billId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "debit_notes_tenantId_number_key" ON "debit_notes"("tenantId", "number");

-- CreateIndex
CREATE INDEX "expenses_tenantId_date_idx" ON "expenses"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_tenantId_number_key" ON "expenses"("tenantId", "number");

-- CreateIndex
CREATE INDEX "pos_sessions_tenantId_status_idx" ON "pos_sessions"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pos_sessions_tenantId_number_key" ON "pos_sessions"("tenantId", "number");

-- CreateIndex
CREATE INDEX "pos_sales_tenantId_sessionId_idx" ON "pos_sales"("tenantId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "pos_sales_tenantId_idempotencyKey_key" ON "pos_sales"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "employees_tenantId_status_idx" ON "employees"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "employees_tenantId_employeeNumber_key" ON "employees"("tenantId", "employeeNumber");

-- CreateIndex
CREATE INDEX "attendances_tenantId_date_idx" ON "attendances"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendances_employeeId_date_key" ON "attendances"("employeeId", "date");

-- CreateIndex
CREATE INDEX "leave_requests_tenantId_employeeId_idx" ON "leave_requests"("tenantId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_tenantId_number_key" ON "payroll_runs"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_tenantId_periodStart_branchId_key" ON "payroll_runs"("tenantId", "periodStart", "branchId");

-- CreateIndex
CREATE INDEX "payslips_tenantId_employeeId_idx" ON "payslips"("tenantId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_payrollRunId_employeeId_key" ON "payslips"("payrollRunId", "employeeId");

-- CreateIndex
CREATE INDEX "loans_tenantId_employeeId_idx" ON "loans"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "attachments_tenantId_entity_entityId_idx" ON "attachments"("tenantId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "notifications_tenantId_userId_readAt_idx" ON "notifications"("tenantId", "userId", "readAt");

-- CreateIndex
CREATE INDEX "webhooks_tenantId_idx" ON "webhooks"("tenantId");

-- CreateIndex
CREATE INDEX "webhook_deliveries_tenantId_webhookId_idx" ON "webhook_deliveries"("tenantId", "webhookId");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_tenantId_idx" ON "api_keys"("tenantId");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "fiscal_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "currencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_matchedLineId_fkey" FOREIGN KEY ("matchedLineId") REFERENCES "journal_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parties" ADD CONSTRAINT "parties_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parties" ADD CONSTRAINT "parties_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parties" ADD CONSTRAINT "parties_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "price_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_contacts" ADD CONSTRAINT "party_contacts_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "item_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units_of_measure" ADD CONSTRAINT "units_of_measure_baseUnitId_fkey" FOREIGN KEY ("baseUnitId") REFERENCES "units_of_measure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "item_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "units_of_measure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "stock_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills_of_materials" ADD CONSTRAINT "bills_of_materials_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "bills_of_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "bills_of_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_originalInvoiceId_fkey" FOREIGN KEY ("originalInvoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_posSaleId_fkey" FOREIGN KEY ("posSaleId") REFERENCES "pos_sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zatca_submissions" ADD CONSTRAINT "zatca_submissions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zatca_certificates" ADD CONSTRAINT "zatca_certificates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_billId_fkey" FOREIGN KEY ("billId") REFERENCES "supplier_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bill_lines" ADD CONSTRAINT "supplier_bill_lines_billId_fkey" FOREIGN KEY ("billId") REFERENCES "supplier_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_billId_fkey" FOREIGN KEY ("billId") REFERENCES "supplier_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sessions" ADD CONSTRAINT "pos_sessions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "pos_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
