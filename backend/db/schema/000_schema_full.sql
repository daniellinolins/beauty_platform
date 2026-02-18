-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: beauty_platform
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `client`
--

DROP TABLE IF EXISTS `client`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `client` (
  `client_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `full_name` varchar(200) NOT NULL,
  `birth_date` date DEFAULT NULL,
  `gender` varchar(20) DEFAULT NULL,
  `email` varchar(200) DEFAULT NULL,
  `phone` varchar(40) DEFAULT NULL,
  `document_type` varchar(30) DEFAULT NULL,
  `document_number` varchar(60) DEFAULT NULL,
  `first_tenant_id` bigint(20) DEFAULT NULL,
  `first_clinic_id` bigint(20) DEFAULT NULL,
  `first_registered_at` datetime DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'ACTIVE',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `created_by` bigint(20) DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `updated_by` bigint(20) DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`client_id`),
  UNIQUE KEY `uq_client_email` (`email`),
  UNIQUE KEY `uq_client_doc` (`document_type`,`document_number`),
  KEY `fk_client_first_tenant` (`first_tenant_id`),
  KEY `fk_client_first_clinic` (`first_clinic_id`),
  KEY `ix_client_status` (`status`),
  KEY `ix_client_name` (`full_name`),
  KEY `ix_client_phone` (`phone`),
  CONSTRAINT `fk_client_first_clinic` FOREIGN KEY (`first_clinic_id`) REFERENCES `clinic` (`clinic_id`),
  CONSTRAINT `fk_client_first_tenant` FOREIGN KEY (`first_tenant_id`) REFERENCES `tenant` (`tenant_id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `client_clinic`
--

DROP TABLE IF EXISTS `client_clinic`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `client_clinic` (
  `client_clinic_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint(20) NOT NULL,
  `clinic_id` bigint(20) NOT NULL,
  `client_id` bigint(20) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'ACTIVE',
  `relationship_start` datetime NOT NULL DEFAULT current_timestamp(),
  `relationship_end` datetime DEFAULT NULL,
  `inactivated_by_type` varchar(20) DEFAULT NULL,
  `inactivated_reason` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `created_by` bigint(20) DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `updated_by` bigint(20) DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`client_clinic_id`),
  UNIQUE KEY `uq_client_clinic` (`client_id`,`clinic_id`),
  KEY `ix_cc_tenant_client` (`tenant_id`,`client_id`),
  KEY `ix_cc_clinic_client` (`clinic_id`,`client_id`),
  KEY `ix_cc_status` (`tenant_id`,`status`),
  CONSTRAINT `fk_cc_client` FOREIGN KEY (`client_id`) REFERENCES `client` (`client_id`),
  CONSTRAINT `fk_cc_clinic` FOREIGN KEY (`clinic_id`) REFERENCES `clinic` (`clinic_id`),
  CONSTRAINT `fk_cc_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenant` (`tenant_id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `client_clinic_authorization`
--

DROP TABLE IF EXISTS `client_clinic_authorization`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `client_clinic_authorization` (
  `authorization_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint(20) NOT NULL,
  `clinic_id` bigint(20) NOT NULL,
  `client_id` bigint(20) NOT NULL,
  `code` varchar(20) NOT NULL,
  `channel` varchar(20) NOT NULL DEFAULT 'INBOX',
  `status` varchar(20) NOT NULL DEFAULT 'SENT',
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `created_by` bigint(20) DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `updated_by` bigint(20) DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`authorization_id`),
  UNIQUE KEY `uq_auth_code` (`code`),
  KEY `ix_auth_tenant_client` (`tenant_id`,`client_id`),
  KEY `ix_auth_tenant_clinic` (`tenant_id`,`clinic_id`),
  KEY `ix_auth_status` (`tenant_id`,`status`),
  KEY `fk_auth_clinic` (`clinic_id`),
  KEY `fk_auth_client` (`client_id`),
  CONSTRAINT `fk_auth_client` FOREIGN KEY (`client_id`) REFERENCES `client` (`client_id`),
  CONSTRAINT `fk_auth_clinic` FOREIGN KEY (`clinic_id`) REFERENCES `clinic` (`clinic_id`),
  CONSTRAINT `fk_auth_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenant` (`tenant_id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `clinic`
--

DROP TABLE IF EXISTS `clinic`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `clinic` (
  `clinic_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint(20) NOT NULL,
  `clinic_code` varchar(60) NOT NULL,
  `name` varchar(200) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'ACTIVE',
  `phone` varchar(40) DEFAULT NULL,
  `email` varchar(200) DEFAULT NULL,
  `country_code` varchar(5) DEFAULT NULL,
  `city` varchar(120) DEFAULT NULL,
  `address_line` varchar(250) DEFAULT NULL,
  `postal_code` varchar(30) DEFAULT NULL,
  `primary_color` varchar(20) DEFAULT NULL,
  `secondary_color` varchar(20) DEFAULT NULL,
  `logo_file_id` bigint(20) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `created_by` bigint(20) DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `updated_by` bigint(20) DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`clinic_id`),
  UNIQUE KEY `uq_clinic_code` (`tenant_id`,`clinic_code`),
  KEY `ix_clinic_tenant` (`tenant_id`),
  KEY `ix_clinic_status` (`tenant_id`,`status`),
  KEY `fk_clinic_logo_file` (`logo_file_id`),
  CONSTRAINT `fk_clinic_logo_file` FOREIGN KEY (`logo_file_id`) REFERENCES `file_object` (`id_file_object`),
  CONSTRAINT `fk_clinic_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenant` (`tenant_id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `contact_verification`
--

DROP TABLE IF EXISTS `contact_verification`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `contact_verification` (
  `verification_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `purpose` varchar(30) NOT NULL,
  `target` varchar(200) NOT NULL,
  `code` varchar(20) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'SENT',
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`verification_id`),
  UNIQUE KEY `uq_verification_code` (`code`),
  KEY `ix_ver_user_purpose` (`user_id`,`purpose`),
  KEY `ix_ver_status` (`status`),
  CONSTRAINT `fk_ver_user` FOREIGN KEY (`user_id`) REFERENCES `user_account` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `file_object`
--

DROP TABLE IF EXISTS `file_object`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `file_object` (
  `id_file_object` bigint(20) NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint(20) NOT NULL,
  `storage_provider` varchar(20) NOT NULL DEFAULT 'LOCAL',
  `storage_path` varchar(500) NOT NULL,
  `original_name` varchar(255) NOT NULL,
  `mime_type` varchar(120) NOT NULL,
  `size_bytes` bigint(20) NOT NULL,
  `sha256` char(64) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `created_by` bigint(20) DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id_file_object`),
  KEY `ix_file_tenant` (`tenant_id`),
  KEY `ix_file_sha` (`tenant_id`,`sha256`),
  CONSTRAINT `fk_file_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenant` (`tenant_id`)
) ENGINE=InnoDB AUTO_INCREMENT=119 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `form`
--

DROP TABLE IF EXISTS `form`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `form` (
  `id_form` bigint(20) NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint(20) NOT NULL,
  `code` varchar(60) NOT NULL,
  `name` varchar(200) NOT NULL,
  `description` varchar(1000) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'ACTIVE',
  `default_language` varchar(10) NOT NULL DEFAULT 'pt-PT',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `created_by` bigint(20) DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `updated_by` bigint(20) DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id_form`),
  UNIQUE KEY `uq_form_tenant_code` (`tenant_id`,`code`),
  KEY `ix_form_tenant` (`tenant_id`),
  KEY `ix_form_status` (`tenant_id`,`status`),
  CONSTRAINT `fk_form_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenant` (`tenant_id`)
) ENGINE=InnoDB AUTO_INCREMENT=48 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `form_answer_index`
--

DROP TABLE IF EXISTS `form_answer_index`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `form_answer_index` (
  `id_form_answer_index` bigint(20) NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint(20) NOT NULL,
  `id_form_submission` bigint(20) NOT NULL,
  `id_form` bigint(20) NOT NULL,
  `id_form_version` bigint(20) NOT NULL,
  `field_key` varchar(120) NOT NULL,
  `field_type` varchar(30) NOT NULL,
  `value_text` varchar(2000) DEFAULT NULL,
  `value_number` decimal(18,4) DEFAULT NULL,
  `value_date` date DEFAULT NULL,
  `value_datetime` datetime DEFAULT NULL,
  `value_bool` tinyint(1) DEFAULT NULL,
  `value_option` varchar(255) DEFAULT NULL,
  `value_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`value_json`)),
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id_form_answer_index`),
  KEY `fk_answer_index_submission` (`id_form_submission`),
  KEY `ix_answer_lookup_text` (`tenant_id`,`id_form`,`field_key`,`value_text`(200)),
  KEY `ix_answer_lookup_number` (`tenant_id`,`id_form`,`field_key`,`value_number`),
  KEY `ix_answer_lookup_date` (`tenant_id`,`id_form`,`field_key`,`value_date`),
  KEY `ix_answer_lookup_bool` (`tenant_id`,`id_form`,`field_key`,`value_bool`),
  KEY `ix_answer_submission` (`tenant_id`,`id_form_submission`),
  CONSTRAINT `fk_answer_index_submission` FOREIGN KEY (`id_form_submission`) REFERENCES `form_submission` (`id_form_submission`),
  CONSTRAINT `fk_answer_index_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `form_rule`
--

DROP TABLE IF EXISTS `form_rule`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `form_rule` (
  `id_form_rule` bigint(20) NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint(20) NOT NULL,
  `rule_type` varchar(30) NOT NULL,
  `rule_key` varchar(80) NOT NULL,
  `id_form` bigint(20) NOT NULL,
  `required_flag` tinyint(1) NOT NULL DEFAULT 1,
  `active_flag` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `created_by` bigint(20) DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `updated_by` bigint(20) DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id_form_rule`),
  KEY `fk_form_rule_form` (`id_form`),
  KEY `ix_form_rule_lookup` (`tenant_id`,`rule_type`,`rule_key`,`active_flag`),
  KEY `ix_form_rule_form` (`tenant_id`,`id_form`),
  CONSTRAINT `fk_form_rule_form` FOREIGN KEY (`id_form`) REFERENCES `form` (`id_form`),
  CONSTRAINT `fk_form_rule_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `form_submission`
--

DROP TABLE IF EXISTS `form_submission`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `form_submission` (
  `id_form_submission` bigint(20) NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint(20) NOT NULL,
  `id_form` bigint(20) NOT NULL,
  `id_form_version` bigint(20) NOT NULL,
  `clinic_id` bigint(20) NOT NULL,
  `client_id` bigint(20) NOT NULL,
  `client_clinic_id` bigint(20) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'DRAFT',
  `payload_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`payload_json`)),
  `snapshot_schema_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`snapshot_schema_json`)),
  `submitted_at` datetime DEFAULT NULL,
  `pdf_file_id` bigint(20) DEFAULT NULL,
  `pdf_generated_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `created_by` bigint(20) DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `updated_by` bigint(20) DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id_form_submission`),
  KEY `fk_submission_form` (`id_form`),
  KEY `fk_submission_form_version` (`id_form_version`),
  KEY `fk_submission_clinic` (`clinic_id`),
  KEY `fk_submission_client` (`client_id`),
  KEY `fk_submission_client_clinic` (`client_clinic_id`),
  KEY `fk_submission_pdf_file` (`pdf_file_id`),
  KEY `ix_submission_tenant_client` (`tenant_id`,`client_id`),
  KEY `ix_submission_tenant_clinic` (`tenant_id`,`clinic_id`),
  KEY `ix_submission_tenant_form` (`tenant_id`,`id_form`),
  KEY `ix_submission_status` (`tenant_id`,`status`),
  KEY `ix_submission_submitted` (`tenant_id`,`submitted_at`),
  CONSTRAINT `fk_submission_client` FOREIGN KEY (`client_id`) REFERENCES `client` (`client_id`),
  CONSTRAINT `fk_submission_client_clinic` FOREIGN KEY (`client_clinic_id`) REFERENCES `client_clinic` (`client_clinic_id`),
  CONSTRAINT `fk_submission_clinic` FOREIGN KEY (`clinic_id`) REFERENCES `clinic` (`clinic_id`),
  CONSTRAINT `fk_submission_form` FOREIGN KEY (`id_form`) REFERENCES `form` (`id_form`),
  CONSTRAINT `fk_submission_form_version` FOREIGN KEY (`id_form_version`) REFERENCES `form_version` (`id_form_version`),
  CONSTRAINT `fk_submission_pdf_file` FOREIGN KEY (`pdf_file_id`) REFERENCES `file_object` (`id_file_object`),
  CONSTRAINT `fk_submission_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenant` (`tenant_id`)
) ENGINE=InnoDB AUTO_INCREMENT=89 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `form_submission_analytics`
--

DROP TABLE IF EXISTS `form_submission_analytics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `form_submission_analytics` (
  `id_form_submission_analytics` bigint(20) NOT NULL AUTO_INCREMENT,
  `id_form_submission` bigint(20) NOT NULL DEFAULT 0,
  `tenant_id` bigint(20) NOT NULL,
  `id_form` bigint(20) NOT NULL,
  `id_form_version` bigint(20) NOT NULL,
  `clinic_id` bigint(20) NOT NULL,
  `client_id` bigint(20) NOT NULL,
  `client_clinic_id` bigint(20) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'DRAFT',
  `column_name` varchar(100) DEFAULT NULL,
  `value_string` varchar(500) DEFAULT NULL,
  `value_long_text` mediumtext DEFAULT NULL,
  `value_number` decimal(15,2) DEFAULT NULL,
  `value_date` date DEFAULT NULL,
  `value_time` time DEFAULT NULL,
  `value_datetime` datetime DEFAULT NULL,
  `value_boolean` tinyint(4) DEFAULT NULL,
  PRIMARY KEY (`id_form_submission_analytics`),
  KEY `idx_form_field_string` (`tenant_id`,`id_form`,`column_name`,`value_string`),
  KEY `idx_form_field_number` (`tenant_id`,`id_form`,`column_name`,`value_number`),
  KEY `idx_form_field_date` (`tenant_id`,`id_form`,`column_name`,`value_date`),
  KEY `idx_form_field_datetime` (`tenant_id`,`id_form`,`column_name`,`value_datetime`),
  KEY `idx_form_field_boolean` (`tenant_id`,`id_form`,`column_name`,`value_boolean`),
  KEY `idx_submission_lookup` (`id_form_submission`),
  KEY `idx_clinic_form` (`tenant_id`,`clinic_id`,`id_form`),
  KEY `idx_tenant_client` (`tenant_id`,`client_id`),
  KEY `idx_client` (`client_id`),
  KEY `idx_status` (`tenant_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `form_submission_file`
--

DROP TABLE IF EXISTS `form_submission_file`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `form_submission_file` (
  `id_form_submission_file` bigint(20) NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint(20) NOT NULL,
  `id_form_submission` bigint(20) NOT NULL,
  `id_file_object` bigint(20) NOT NULL,
  `field_key` varchar(120) DEFAULT NULL,
  `file_role` varchar(30) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id_form_submission_file`),
  KEY `fk_sub_file_submission` (`id_form_submission`),
  KEY `fk_sub_file_file` (`id_file_object`),
  KEY `ix_sub_file_lookup` (`tenant_id`,`id_form_submission`,`file_role`),
  KEY `ix_sub_file_field` (`tenant_id`,`id_form_submission`,`field_key`),
  CONSTRAINT `fk_sub_file_file` FOREIGN KEY (`id_file_object`) REFERENCES `file_object` (`id_file_object`),
  CONSTRAINT `fk_sub_file_submission` FOREIGN KEY (`id_form_submission`) REFERENCES `form_submission` (`id_form_submission`),
  CONSTRAINT `fk_sub_file_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `form_version`
--

DROP TABLE IF EXISTS `form_version`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `form_version` (
  `id_form_version` bigint(20) NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint(20) NOT NULL,
  `id_form` bigint(20) NOT NULL,
  `version_number` int(11) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'DRAFT',
  `schema_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`schema_json`)),
  `publish_at` datetime DEFAULT NULL,
  `published_by` bigint(20) DEFAULT NULL,
  `checksum_sha256` char(64) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `created_by` bigint(20) DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `updated_by` bigint(20) DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` bigint(20) DEFAULT NULL,
  `published_flag` tinyint(4) GENERATED ALWAYS AS (case when `status` = 'PUBLISHED' then 1 else NULL end) STORED,
  PRIMARY KEY (`id_form_version`),
  UNIQUE KEY `uq_form_version` (`tenant_id`,`id_form`,`version_number`),
  UNIQUE KEY `uq_form_one_published` (`id_form`,`published_flag`),
  KEY `ix_form_version_tenant_form` (`tenant_id`,`id_form`),
  KEY `ix_form_version_status` (`tenant_id`,`status`),
  KEY `ix_form_version_form_status` (`id_form`,`status`),
  CONSTRAINT `fk_form_version_form` FOREIGN KEY (`id_form`) REFERENCES `form` (`id_form`),
  CONSTRAINT `fk_form_version_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenant` (`tenant_id`)
) ENGINE=InnoDB AUTO_INCREMENT=64 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `notification`
--

DROP TABLE IF EXISTS `notification`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notification` (
  `notification_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `tenant_id` bigint(20) DEFAULT NULL,
  `title` varchar(200) NOT NULL,
  `message` text NOT NULL,
  `type` varchar(30) NOT NULL DEFAULT 'INFO',
  `channel` varchar(20) NOT NULL DEFAULT 'INBOX',
  `meta_json` text DEFAULT NULL,
  `sent_at` datetime NOT NULL DEFAULT current_timestamp(),
  `read_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `created_by` bigint(20) DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `updated_by` bigint(20) DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`notification_id`),
  KEY `ix_notif_user` (`user_id`,`read_at`),
  KEY `ix_notif_tenant` (`tenant_id`,`sent_at`),
  CONSTRAINT `fk_notif_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenant` (`tenant_id`),
  CONSTRAINT `fk_notif_user` FOREIGN KEY (`user_id`) REFERENCES `user_account` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `service`
--

DROP TABLE IF EXISTS `service`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `service` (
  `service_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint(20) NOT NULL,
  `clinic_id` bigint(20) NOT NULL,
  `service_code` varchar(60) DEFAULT NULL,
  `name` varchar(200) NOT NULL,
  `description` varchar(1000) DEFAULT NULL,
  `duration_min` int(11) DEFAULT NULL,
  `price` decimal(12,2) DEFAULT NULL,
  `active_flag` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `created_by` bigint(20) DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `updated_by` bigint(20) DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`service_id`),
  UNIQUE KEY `uq_service_code` (`tenant_id`,`clinic_id`,`service_code`),
  KEY `ix_service_tenant_clinic` (`tenant_id`,`clinic_id`),
  KEY `ix_service_active` (`tenant_id`,`clinic_id`,`active_flag`),
  KEY `fk_service_clinic` (`clinic_id`),
  CONSTRAINT `fk_service_clinic` FOREIGN KEY (`clinic_id`) REFERENCES `clinic` (`clinic_id`),
  CONSTRAINT `fk_service_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenant` (`tenant_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `subscription_plan`
--

DROP TABLE IF EXISTS `subscription_plan`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `subscription_plan` (
  `plan_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `plan_code` varchar(60) NOT NULL,
  `name` varchar(200) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'ACTIVE',
  `price_monthly` decimal(12,2) NOT NULL DEFAULT 0.00,
  `currency_code` varchar(10) NOT NULL DEFAULT 'EUR',
  `max_clinics` int(11) NOT NULL DEFAULT 1,
  `max_clients` int(11) NOT NULL DEFAULT 0,
  `max_forms` int(11) NOT NULL DEFAULT 0,
  `max_submissions_month` int(11) NOT NULL DEFAULT 0,
  `max_storage_mb` int(11) NOT NULL DEFAULT 0,
  `features_json` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `created_by` bigint(20) DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `updated_by` bigint(20) DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`plan_id`),
  UNIQUE KEY `uq_plan_code` (`plan_code`),
  KEY `ix_plan_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tenant`
--

DROP TABLE IF EXISTS `tenant`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tenant` (
  `tenant_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `tenant_code` varchar(60) NOT NULL,
  `legal_name` varchar(200) NOT NULL,
  `trade_name` varchar(200) DEFAULT NULL,
  `tax_id` varchar(40) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'ACTIVE',
  `default_language` varchar(10) NOT NULL DEFAULT 'pt-PT',
  `timezone` varchar(60) NOT NULL DEFAULT 'Europe/Lisbon',
  `currency_code` varchar(10) NOT NULL DEFAULT 'EUR',
  `brand_name` varchar(200) DEFAULT NULL,
  `primary_color` varchar(20) DEFAULT NULL,
  `secondary_color` varchar(20) DEFAULT NULL,
  `logo_file_id` bigint(20) DEFAULT NULL,
  `login_bg_file_id` bigint(20) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `created_by` bigint(20) DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `updated_by` bigint(20) DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`tenant_id`),
  UNIQUE KEY `uq_tenant_code` (`tenant_code`),
  KEY `ix_tenant_status` (`status`),
  KEY `fk_tenant_logo_file` (`logo_file_id`),
  KEY `fk_tenant_loginbg_file` (`login_bg_file_id`),
  CONSTRAINT `fk_tenant_loginbg_file` FOREIGN KEY (`login_bg_file_id`) REFERENCES `file_object` (`id_file_object`),
  CONSTRAINT `fk_tenant_logo_file` FOREIGN KEY (`logo_file_id`) REFERENCES `file_object` (`id_file_object`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tenant_subscription`
--

DROP TABLE IF EXISTS `tenant_subscription`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tenant_subscription` (
  `tenant_subscription_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint(20) NOT NULL,
  `plan_id` bigint(20) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'TRIAL',
  `trial_start_at` datetime DEFAULT NULL,
  `trial_end_at` datetime DEFAULT NULL,
  `current_period_start` datetime DEFAULT NULL,
  `current_period_end` datetime DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `provider` varchar(30) DEFAULT NULL,
  `provider_subscription_id` varchar(120) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `created_by` bigint(20) DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `updated_by` bigint(20) DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`tenant_subscription_id`),
  KEY `ix_ts_tenant` (`tenant_id`),
  KEY `ix_ts_status` (`tenant_id`,`status`),
  KEY `ix_ts_period` (`tenant_id`,`current_period_end`),
  KEY `fk_ts_plan` (`plan_id`),
  CONSTRAINT `fk_ts_plan` FOREIGN KEY (`plan_id`) REFERENCES `subscription_plan` (`plan_id`),
  CONSTRAINT `fk_ts_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenant` (`tenant_id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tenant_usage`
--

DROP TABLE IF EXISTS `tenant_usage`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tenant_usage` (
  `tenant_id` bigint(20) NOT NULL,
  `month_key` char(7) NOT NULL,
  `submissions_count_month` int(11) NOT NULL DEFAULT 0,
  `storage_used_bytes` bigint(20) NOT NULL DEFAULT 0,
  `forms_count` int(11) NOT NULL DEFAULT 0,
  `clients_count` int(11) NOT NULL DEFAULT 0,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`tenant_id`),
  KEY `ix_tenant_usage_month` (`month_key`),
  CONSTRAINT `fk_tenant_usage_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_account`
--

DROP TABLE IF EXISTS `user_account`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_account` (
  `user_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_type` varchar(20) NOT NULL,
  `tenant_id` bigint(20) DEFAULT NULL,
  `client_id` bigint(20) DEFAULT NULL,
  `email` varchar(200) NOT NULL,
  `phone` varchar(40) DEFAULT NULL,
  `email_verified` tinyint(1) NOT NULL DEFAULT 0,
  `phone_verified` tinyint(1) NOT NULL DEFAULT 0,
  `password_hash` varchar(255) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'ACTIVE',
  `last_login_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `created_by` bigint(20) DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `updated_by` bigint(20) DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_user_email` (`email`),
  UNIQUE KEY `uq_user_phone` (`phone`),
  KEY `ix_user_type` (`user_type`),
  KEY `ix_user_tenant` (`tenant_id`),
  KEY `ix_user_client` (`client_id`),
  KEY `ix_user_status` (`status`),
  KEY `ix_user_phone_verified` (`phone_verified`),
  CONSTRAINT `fk_user_client` FOREIGN KEY (`client_id`) REFERENCES `client` (`client_id`),
  CONSTRAINT `fk_user_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenant` (`tenant_id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_clinic`
--

DROP TABLE IF EXISTS `user_clinic`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_clinic` (
  `user_clinic_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint(20) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  `clinic_id` bigint(20) NOT NULL,
  `role_code` varchar(30) NOT NULL DEFAULT 'STAFF',
  `active_flag` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `created_by` bigint(20) DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `updated_by` bigint(20) DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`user_clinic_id`),
  UNIQUE KEY `uq_user_clinic` (`user_id`,`clinic_id`),
  KEY `fk_uc_clinic` (`clinic_id`),
  KEY `ix_uc_tenant_user` (`tenant_id`,`user_id`),
  KEY `ix_uc_tenant_clinic` (`tenant_id`,`clinic_id`),
  KEY `ix_uc_role` (`tenant_id`,`role_code`),
  CONSTRAINT `fk_uc_clinic` FOREIGN KEY (`clinic_id`) REFERENCES `clinic` (`clinic_id`),
  CONSTRAINT `fk_uc_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenant` (`tenant_id`),
  CONSTRAINT `fk_uc_user` FOREIGN KEY (`user_id`) REFERENCES `user_account` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary table structure for view `v_client_clinics`
--

DROP TABLE IF EXISTS `v_client_clinics`;
/*!50001 DROP VIEW IF EXISTS `v_client_clinics`*/;
SET @saved_cs_client     = @@character_set_client;
SET character_set_client = utf8;
/*!50001 CREATE VIEW `v_client_clinics` AS SELECT
 1 AS `client_id`,
  1 AS `tenant_id`,
  1 AS `clinic_id`,
  1 AS `relationship_status`,
  1 AS `clinic_name`,
  1 AS `tenant_trade_name` */;
SET character_set_client = @saved_cs_client;

--
-- Dumping events for database 'beauty_platform'
--

--
-- Dumping routines for database 'beauty_platform'
--
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_ZERO_IN_DATE,NO_ZERO_DATE,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_recalc_saldo_mes_anterior` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_recalc_saldo_mes_anterior`(
    IN p_id_livro_caixa INT,
    IN p_dt_referencia DATE
)
BEGIN
    DECLARE v_dt_mes DATE;
    DECLARE v_dt_limite DATE;
    DECLARE v_dt_prox_mes DATE;
    DECLARE v_dt_mes_anterior DATE;

    DECLARE v_id_conta_saldo INT;
    DECLARE v_saldo_inicial DECIMAL(12,2);
    DECLARE v_movimento DECIMAL(12,2);
    DECLARE v_saldo_final DECIMAL(12,2);

    -- conta do saldo (por igreja do livro)
    SELECT cc.ID_CONTA_CONTABIL
      INTO v_id_conta_saldo
      FROM conta_contabil cc
     WHERE cc.CODIGO = '0'
       AND cc.DESCRICAO = 'SALDO_ANTERIOR'
       AND cc.ID_IGREJA = (
            SELECT lc.ID_IGREJA
              FROM livro_caixa lc
             WHERE lc.id_livro_caixa = p_id_livro_caixa
            LIMIT 1
       )
     LIMIT 1;

    IF v_id_conta_saldo IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Conta contábil de saldo (CODIGO=0, DESCRICAO=SALDO_ANTERIOR) não encontrada para a igreja do livro.';
    END IF;

    -- primeiro dia do mês afetado
    SET v_dt_mes = DATE_SUB(p_dt_referencia, INTERVAL DAY(p_dt_referencia) - 1 DAY);

    -- primeiro dia do mês atual
    SET v_dt_limite = DATE_SUB(CURDATE(), INTERVAL DAY(CURDATE()) - 1 DAY);

    WHILE v_dt_mes <= v_dt_limite DO

        SET v_dt_mes_anterior = DATE_SUB(v_dt_mes, INTERVAL 1 MONTH);

        -- saldo inicial do mês = saldo final do mês anterior (registrado como saldo_mes_ref = mês anterior)
        SELECT COALESCE(MAX(r.valor), 0)
          INTO v_saldo_inicial
          FROM registo_livro_caixa r
         WHERE r.id_livro_caixa = p_id_livro_caixa
           AND r.id_conta_contabil = v_id_conta_saldo
           AND r.saldo_mes_ref = v_dt_mes_anterior;

        -- movimento do mês (entradas - saídas), ignorando qualquer linha de saldo
        SELECT COALESCE(SUM(
                   CASE
                     WHEN cc.DOM_NATUREZA IN ('ENTRADA','RECEITA','CREDITO') THEN COALESCE(r.valor,0)
                     WHEN cc.DOM_NATUREZA IN ('SAIDA','DESPESA','DEBITO')   THEN -COALESCE(r.valor,0)
                     ELSE 0
                   END
               ), 0)
          INTO v_movimento
          FROM registo_livro_caixa r
          JOIN conta_contabil cc
            ON cc.ID_CONTA_CONTABIL = r.id_conta_contabil
         WHERE r.id_livro_caixa = p_id_livro_caixa
           AND r.dt_referencia >= v_dt_mes
           AND r.dt_referencia <  DATE_ADD(v_dt_mes, INTERVAL 1 MONTH)
           AND r.saldo_mes_ref IS NULL         -- garante: saldo não entra no movimento
           AND r.id_conta_contabil <> v_id_conta_saldo
           AND (r.dom_ativo IS NULL OR r.dom_ativo = 'SIM');

        SET v_saldo_final = v_saldo_inicial + v_movimento;

        -- grava no mês seguinte
        SET v_dt_prox_mes = DATE_ADD(v_dt_mes, INTERVAL 1 MONTH);

        INSERT INTO registo_livro_caixa
            (id_livro_caixa,
             id_conta_contabil,
             dom_legenda,
             descricao,
             dt_referencia,
             saldo_mes_ref,
             valor,
             dt_registo,
             dom_ativo,
             dom_origem_registo)
        VALUES
            (p_id_livro_caixa,
             v_id_conta_saldo,
             '0',
             'Saldo do mês anterior',
             v_dt_prox_mes,
             v_dt_mes,            -- mês fechado
             v_saldo_final,
             NOW(),
             'SIM',
             'AUTO_SALDO')
        ON DUPLICATE KEY UPDATE
             valor = VALUES(valor),
             dt_referencia = VALUES(dt_referencia),
             dt_registo = NOW(),
             dom_ativo = 'SIM',
             dom_origem_registo = 'AUTO_SALDO';

        SET v_dt_mes = v_dt_prox_mes;

    END WHILE;

END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Final view structure for view `v_client_clinics`
--

/*!50001 DROP VIEW IF EXISTS `v_client_clinics`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_general_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `v_client_clinics` AS select `cc`.`client_id` AS `client_id`,`cc`.`tenant_id` AS `tenant_id`,`cc`.`clinic_id` AS `clinic_id`,`cc`.`status` AS `relationship_status`,`c`.`name` AS `clinic_name`,`t`.`trade_name` AS `tenant_trade_name` from ((`client_clinic` `cc` join `clinic` `c` on(`c`.`clinic_id` = `cc`.`clinic_id`)) join `tenant` `t` on(`t`.`tenant_id` = `cc`.`tenant_id`)) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-02-18 22:21:23
