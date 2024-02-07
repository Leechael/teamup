// SPDX-License-Identifier: MIT
pragma solidity >=0.8.21;

import {ERC1155} from 'solmate/src/tokens/ERC1155.sol';
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./libraries/UnsafeMath.sol";

contract Teamup is ERC1155, Ownable, AccessControl {
  using Strings for uint256;

  //
  // Structs
  //
  struct Team {
    uint256 id;
    address leader;
    uint256 points;
  }

  //
  // Constants
  //
  uint constant ACTION_CREATE_TEAM = 1;
  uint constant ACTION_JOIN_TEAM = 2;

  bytes32 public constant ROLE_ATTESTOR = keccak256("ROLE_ATTESTOR");

  //
  // Storage
  //

  uint256 public nextTeamId = 1;

  mapping(uint256 => Team) public teams;

  mapping(address => uint256) public leaderOf;
  mapping(uint256 => mapping(address => bool)) public membersOf;

  bool public hasDrawn = false;

  uint256 public prizePool;


  //
  // Events
  //
  event Created(uint256 indexed teamId, address indexed creator, uint256 points);
  event Joined(uint256 indexed teamId, address indexed member, uint256 points);
  event Scored(uint256 indexed teamId, address indexed member, uint256 points);
  event Drawn(uint256 indexed winnerTeamId, uint256 prizePool, uint256 tokenPerPoint);
  event Contributed(address indexed from, uint256 value);

  //
  // Functions
  //

  constructor() {
    _transferOwnership(msg.sender);
    _grantRole(ROLE_ATTESTOR, msg.sender);
  }

  function setAttestor(address target) external onlyOwner {
    _grantRole(ROLE_ATTESTOR, target);
  }

  ///
  /// Donate is use for deposit prize pool.
  ///
  function contribute() external payable {
    require(msg.value > 0.005 ether, "The minimal value for contribute is 0.005 ether.");
    require(hasDrawn == false, "The game has ended.");

    prizePool += msg.value;

    emit Contributed(msg.sender, msg.value);
  }

  function createTeam(address leader) external {
    require(hasRole(ROLE_ATTESTOR, msg.sender), "Only attestor can call createTeam");
    require(leaderOf[leader] == 0, "The leader already created a team.");
    require(hasDrawn == false, "The game has ended.");

    uint256 _id = nextTeamId++;
    teams[_id] = Team(_id, leader, 1 ether);
    leaderOf[leader] = _id;

    emit Created(_id, leader, 1 ether);

    _mint(leader, _id, 1 ether, '');
  }

  function joinTeam(uint256 teamId, address member) external {
    require(hasRole(ROLE_ATTESTOR, msg.sender), "Only attestor can call joinTeam.");
    require(teamId < nextTeamId, "Team not exists.");
    require(leaderOf[member] != teamId, "You can not join your own team.");
    require(membersOf[teamId][member] == false, "You already joined the team.");
    require(hasDrawn == false, "The game has ended.");

    teams[teamId].points += 1 ether;
    membersOf[teamId][member] = true;

    emit Joined(teamId, member, 1 ether);

    _mint(member, teamId, 1 ether, '');
  }

  function isMemberOf(uint256 teamId) external view returns (bool) {
    return membersOf[teamId][msg.sender];
  }

  function score(uint256 teamId, address member, uint256 points) external {
    require(hasRole(ROLE_ATTESTOR, msg.sender), "Only attestor can call earnPoints.");
    require(teamId < nextTeamId, "Team not exists.");
    require(leaderOf[member] == teamId || membersOf[teamId][member] == true, "You should be leader or member of the team.");
    require(points > 0.05 ether, "The minimal points for earnPoints is 0.05 ether.");
    require(hasDrawn == false, "The game has ended.");

    teams[teamId].points += points;

    emit Scored(teamId, member, points);

    _mint(member, teamId, points, '');
  }

  function draw(uint256 winnerId, address[] calldata addresses) external {
    require(hasRole(ROLE_ATTESTOR, msg.sender), "Only attestor can call draw.");
    require(hasDrawn == false, "The game has drawn.");

    hasDrawn = true;

    uint256 tokenPerPoint = UnsafeMath.divRoundingDown(prizePool, teams[winnerId].points);
    unchecked {
      for (uint256 i = 0; i < addresses.length; i++) {
        uint256 points = balanceOf[addresses[i]][winnerId];
        uint256 value = points * tokenPerPoint;
        (bool sentPayment, ) = payable(addresses[i]).call{value: value}("");
        if (sentPayment) {
          prizePool -= value;
        }
        // NOTE: if we emit error when pay fail, it will a potential bugs here.
        require(sentPayment, "Send payment failed.");
      }
    }

    emit Drawn(winnerId, prizePool, tokenPerPoint);
  }

  //
  // Overrides: ERC1155
  //
  function uri(uint256 teamId) public view override returns (string memory) {
    require(teamId < nextTeamId, "Team not exists.");
    return string(abi.encodePacked('', teamId.toString()));
  }

  //
  //
  //
  
  function supportsInterface(bytes4 interfaceId) public view virtual override(ERC1155, AccessControl) returns (bool) {
    return
      interfaceId == type(ERC1155).interfaceId ||
      interfaceId == type(AccessControl).interfaceId ||
      super.supportsInterface(interfaceId);
  }
}
