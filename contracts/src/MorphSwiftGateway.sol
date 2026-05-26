// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);

    function transfer(address to, uint256 amount) external returns (bool);
}

contract MorphSwiftGateway {
    error ZeroAddress();
    error InvalidAmount();
    error InvalidExpiry();
    error InvalidFeeBps();
    error InvalidMerchantId();
    error InvalidCheckoutId();
    error MerchantExists(bytes32 merchantId);
    error MerchantNotFound(bytes32 merchantId);
    error MerchantInactive(bytes32 merchantId);
    error UnauthorizedMerchant(bytes32 merchantId, address caller);
    error CheckoutExists(bytes32 checkoutId);
    error CheckoutNotFound(bytes32 checkoutId);
    error CheckoutExpired(bytes32 checkoutId);
    error CheckoutAlreadyPaid(bytes32 checkoutId);
    error TokenTransferFailed();
    error ReentrancyBlocked();

    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    event DefaultFeeUpdated(uint16 previousFeeBps, uint16 newFeeBps);
    event MerchantRegistered(
        bytes32 indexed merchantId,
        address indexed operator,
        address indexed payoutWallet,
        uint16 feeBps,
        bytes32 metadataHash
    );
    event MerchantUpdated(
        bytes32 indexed merchantId,
        address indexed operator,
        address payoutWallet,
        bool active,
        uint16 feeBps,
        bytes32 metadataHash
    );
    event CheckoutCreated(
        bytes32 indexed checkoutId,
        bytes32 indexed merchantId,
        address indexed token,
        uint256 amount,
        uint256 feeAmount,
        uint256 expiresAt,
        bytes32 orderRef
    );
    event CheckoutPaid(
        bytes32 indexed checkoutId,
        bytes32 indexed merchantId,
        address indexed payer,
        address token,
        uint256 amount,
        uint256 feeAmount,
        address payoutWallet,
        address treasury,
        bytes32 orderRef
    );
    event CheckoutCancelled(bytes32 indexed checkoutId, bytes32 indexed merchantId);

    struct Merchant {
        address operator;
        address payoutWallet;
        bool active;
        uint16 feeBps;
        bytes32 metadataHash;
        uint96 createdAt;
    }

    struct Checkout {
        bytes32 merchantId;
        address token;
        uint128 amount;
        uint128 feeAmount;
        uint96 expiresAt;
        uint96 createdAt;
        uint96 paidAt;
        address payer;
        bytes32 orderRef;
        bool paid;
    }

    address public owner;
    address public treasury;
    uint16 public defaultFeeBps;
    uint16 public constant MAX_FEE_BPS = 500;

    bool private _locked;

    mapping(bytes32 => Merchant) private _merchants;
    mapping(bytes32 => Checkout) private _checkouts;

    modifier onlyOwner() {
        if (msg.sender != owner) revert UnauthorizedMerchant(bytes32(0), msg.sender);
        _;
    }

    modifier nonReentrant() {
        if (_locked) revert ReentrancyBlocked();
        _locked = true;
        _;
        _locked = false;
    }

    modifier onlyMerchant(bytes32 merchantId) {
        Merchant memory merchant = _merchants[merchantId];
        if (merchant.createdAt == 0) revert MerchantNotFound(merchantId);
        if (merchant.operator != msg.sender) revert UnauthorizedMerchant(merchantId, msg.sender);
        _;
    }

    constructor(address treasury_, uint16 defaultFeeBps_) {
        if (treasury_ == address(0)) revert ZeroAddress();
        if (defaultFeeBps_ > MAX_FEE_BPS) revert InvalidFeeBps();

        owner = msg.sender;
        treasury = treasury_;
        defaultFeeBps = defaultFeeBps_;

        emit TreasuryUpdated(address(0), treasury_);
        emit DefaultFeeUpdated(0, defaultFeeBps_);
    }

    function registerMerchant(
        bytes32 merchantId,
        address payoutWallet,
        bytes32 metadataHash,
        uint16 feeBps
    ) external {
        if (merchantId == bytes32(0)) revert InvalidMerchantId();
        if (payoutWallet == address(0)) revert ZeroAddress();
        if (payoutWallet != msg.sender) revert UnauthorizedMerchant(merchantId, msg.sender);
        if (_merchants[merchantId].createdAt != 0) revert MerchantExists(merchantId);

        uint16 effectiveFeeBps = _resolveFeeBps(feeBps);

        _merchants[merchantId] = Merchant({
            operator: msg.sender,
            payoutWallet: payoutWallet,
            active: true,
            feeBps: effectiveFeeBps,
            metadataHash: metadataHash,
            createdAt: uint96(block.timestamp)
        });

        emit MerchantRegistered(merchantId, msg.sender, payoutWallet, effectiveFeeBps, metadataHash);
    }

    function updateMerchant(
        bytes32 merchantId,
        address payoutWallet,
        bool active,
        bytes32 metadataHash,
        uint16 feeBps
    ) external onlyMerchant(merchantId) {
        if (payoutWallet == address(0)) revert ZeroAddress();

        Merchant storage merchant = _merchants[merchantId];
        merchant.payoutWallet = payoutWallet;
        merchant.active = active;
        merchant.metadataHash = metadataHash;
        merchant.feeBps = _resolveFeeBps(feeBps);

        emit MerchantUpdated(merchantId, merchant.operator, payoutWallet, active, merchant.feeBps, metadataHash);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();

        address previousTreasury = treasury;
        treasury = treasury_;

        emit TreasuryUpdated(previousTreasury, treasury_);
    }

    function setDefaultFeeBps(uint16 feeBps) external onlyOwner {
        if (feeBps > MAX_FEE_BPS) revert InvalidFeeBps();

        uint16 previousFeeBps = defaultFeeBps;
        defaultFeeBps = feeBps;

        emit DefaultFeeUpdated(previousFeeBps, feeBps);
    }

    function setMerchantActive(bytes32 merchantId, bool active) external onlyMerchant(merchantId) {
        Merchant storage merchant = _merchants[merchantId];
        merchant.active = active;

        emit MerchantUpdated(
            merchantId,
            merchant.operator,
            merchant.payoutWallet,
            active,
            merchant.feeBps,
            merchant.metadataHash
        );
    }

    function createCheckout(
        bytes32 checkoutId,
        bytes32 merchantId,
        address token,
        uint256 amount,
        uint256 expiresAt,
        bytes32 orderRef
    ) external onlyMerchant(merchantId) {
        if (checkoutId == bytes32(0)) revert InvalidCheckoutId();
        if (token == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();
        if (expiresAt <= block.timestamp) revert InvalidExpiry();
        if (_checkouts[checkoutId].createdAt != 0) revert CheckoutExists(checkoutId);

        Merchant memory merchant = _merchants[merchantId];
        if (!merchant.active) revert MerchantInactive(merchantId);

        uint16 feeBps = merchant.feeBps == 0 ? defaultFeeBps : merchant.feeBps;
        uint256 feeAmount = (amount * feeBps) / 10_000;

        _checkouts[checkoutId] = Checkout({
            merchantId: merchantId,
            token: token,
            amount: _toUint128(amount),
            feeAmount: _toUint128(feeAmount),
            expiresAt: uint96(expiresAt),
            createdAt: uint96(block.timestamp),
            paidAt: 0,
            payer: address(0),
            orderRef: orderRef,
            paid: false
        });

        emit CheckoutCreated(checkoutId, merchantId, token, amount, feeAmount, expiresAt, orderRef);
    }

    function cancelCheckout(bytes32 checkoutId) external {
        Checkout storage checkout = _checkouts[checkoutId];
        if (checkout.createdAt == 0) revert CheckoutNotFound(checkoutId);

        Merchant memory merchant = _merchants[checkout.merchantId];
        if (merchant.operator != msg.sender) revert UnauthorizedMerchant(checkout.merchantId, msg.sender);
        if (checkout.paid) revert CheckoutAlreadyPaid(checkoutId);

        bytes32 merchantId = checkout.merchantId;

        delete _checkouts[checkoutId];

        emit CheckoutCancelled(checkoutId, merchantId);
    }

    function payCheckout(bytes32 checkoutId) external nonReentrant {
        Checkout storage checkout = _checkouts[checkoutId];
        if (checkout.createdAt == 0) revert CheckoutNotFound(checkoutId);
        if (checkout.paid) revert CheckoutAlreadyPaid(checkoutId);
        if (checkout.expiresAt <= block.timestamp) revert CheckoutExpired(checkoutId);

        Merchant memory merchant = _merchants[checkout.merchantId];
        if (merchant.createdAt == 0) revert MerchantNotFound(checkout.merchantId);
        if (!merchant.active) revert MerchantInactive(checkout.merchantId);

        uint256 amount = uint256(checkout.amount);
        uint256 feeAmount = uint256(checkout.feeAmount);
        uint256 merchantAmount = amount - feeAmount;

        checkout.paid = true;
        checkout.payer = msg.sender;
        checkout.paidAt = uint96(block.timestamp);

        _safeTransferFrom(checkout.token, msg.sender, address(this), amount);
        _safeTransfer(checkout.token, merchant.payoutWallet, merchantAmount);

        if (feeAmount != 0) {
            _safeTransfer(checkout.token, treasury, feeAmount);
        }

        emit CheckoutPaid(
            checkoutId,
            checkout.merchantId,
            msg.sender,
            checkout.token,
            amount,
            feeAmount,
            merchant.payoutWallet,
            treasury,
            checkout.orderRef
        );
    }

    function getMerchant(
        bytes32 merchantId
    ) external view returns (
        address operator,
        address payoutWallet,
        bool active,
        uint16 feeBps,
        bytes32 metadataHash,
        uint96 createdAt
    ) {
        Merchant memory merchant = _merchants[merchantId];
        if (merchant.createdAt == 0) revert MerchantNotFound(merchantId);

        return (
            merchant.operator,
            merchant.payoutWallet,
            merchant.active,
            merchant.feeBps,
            merchant.metadataHash,
            merchant.createdAt
        );
    }

    function getCheckout(
        bytes32 checkoutId
    ) external view returns (
        bytes32 merchantId,
        address token,
        uint256 amount,
        uint256 feeAmount,
        uint96 expiresAt,
        uint96 createdAt,
        uint96 paidAt,
        address payer,
        bytes32 orderRef,
        bool paid
    ) {
        Checkout memory checkout = _checkouts[checkoutId];
        if (checkout.createdAt == 0) revert CheckoutNotFound(checkoutId);

        return (
            checkout.merchantId,
            checkout.token,
            checkout.amount,
            checkout.feeAmount,
            checkout.expiresAt,
            checkout.createdAt,
            checkout.paidAt,
            checkout.payer,
            checkout.orderRef,
            checkout.paid
        );
    }

    function deriveMerchantId(address merchantWallet, bytes32 merchantNonce) external pure returns (bytes32) {
        return keccak256(abi.encodePacked("MorphSwift:merchant:", merchantWallet, merchantNonce));
    }

    function deriveCheckoutId(bytes32 merchantId, bytes32 orderRef) external pure returns (bytes32) {
        return keccak256(abi.encodePacked("MorphSwift:checkout:", merchantId, orderRef));
    }

    receive() external payable {
        revert();
    }

    fallback() external payable {
        revert();
    }

    function _resolveFeeBps(uint16 feeBps) internal view returns (uint16) {
        uint16 resolved = feeBps == 0 ? defaultFeeBps : feeBps;
        if (resolved > MAX_FEE_BPS) revert InvalidFeeBps();
        return resolved;
    }

    function _toUint128(uint256 value) internal pure returns (uint128) {
        if (value > type(uint128).max) revert InvalidAmount();
        return uint128(value);
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount)
        );
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert TokenTransferFailed();
        }
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert TokenTransferFailed();
        }
    }
}